import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { writeAudit } from '../audit/audit.service.js';
import * as repo from './journal.repository.js';
import { getDb } from '../../db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { journalEntries, tradingAccounts, reviews } from '../../db/schema/index.js';
import type { Request } from 'express';

/**
 * Journal entries business logic (engineering-contract.md §5, api-spec.md §9.10).
 */
export interface JournalEntryResource {
  id: string;
  accountId: string | null;
  account: { id: string; name: string; currency: string; type: string } | null;
  entryDate: string;
  title: string | null;
  body: string;
  moodScore: number | null;
  wordCount: number;
  emotions: Array<{ id: string; emotion: string; intensity: number; phase: 'before' | 'during' | 'after'; note: string | null; createdAt: string }>;
  tradeSummary: { tradeCount: number; netPnl: string; closedTrades: number };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toResource(entry: repo.JournalEntryWithRelations): JournalEntryResource {
  return {
    id: entry.id,
    accountId: entry.accountId,
    account: entry.account,
    entryDate: entry.entryDate,
    title: entry.title,
    body: entry.body,
    moodScore: entry.moodScore ?? null,
    wordCount: entry.wordCount,
    emotions: entry.emotions.map(e => ({
      id: e.id,
      emotion: e.emotion,
      intensity: e.intensity,
      phase: e.phase as 'before' | 'during' | 'after',
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
    tradeSummary: entry.tradeSummary,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    deletedAt: entry.deletedAt?.toISOString() ?? null,
  };
}

export async function listJournalEntries(
  userId: string,
  query: { from?: string; to?: string; accountId?: string; hasEmotions?: boolean; limit?: number; offset?: number },
): Promise<{ data: JournalEntryResource[]; meta: { limit: number; offset: number; totalCount: number } }> {
  const { data, meta } = await repo.listJournalEntries(userId, query as { from?: string; to?: string; accountId?: string; hasEmotions?: boolean; limit: number; offset: number });
  return { data: data.map(toResource), meta };
}

export async function getJournalEntry(userId: string, id: string): Promise<repo.JournalEntryWithRelations> {
  const entry = await repo.getJournalEntryById(userId, id);
  if (!entry) throw new NotFoundError('Journal entry not found');
  return entry;
}

export async function createJournalEntry(
  userId: string,
  input: { entryDate: string; title?: string | null; body: string; moodScore?: number | null; accountId?: string | null },
  req: Request,
): Promise<{ id: string }> {
  // Check for duplicate date
  const existing = await getDb()
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.entryDate, input.entryDate),
        isNull(journalEntries.deletedAt),
      )
    )
    .limit(1);

  if (existing[0]) {
    throw new ConflictError('Journal entry for this date already exists');
  }

  // Verify account ownership if provided
  if (input.accountId) {
    const accountRows = await getDb()
      .select({ id: tradingAccounts.id })
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.id, input.accountId),
          eq(tradingAccounts.userId, userId),
          isNull(tradingAccounts.deletedAt),
        )
      )
      .limit(1);
    if (!accountRows[0]) {
      throw new NotFoundError('Trading account not found');
    }
  }

  // Compute word count
  const wordCount = input.body.trim() ? input.body.trim().split(/\s+/).length : 0;

  const entry = await repo.insertJournalEntry(userId, {
    ...input,
    wordCount,
  });

  await writeAudit({
    actorUserId: userId,
    action: 'journal.create',
    entityType: 'journal_entry',
    entityId: entry.id,
    req,
  });

  return { id: entry.id };
}

export async function updateJournalEntry(
  userId: string,
  id: string,
  patch: Partial<{ entryDate: string; title: string | null; body: string; moodScore: number | null; accountId: string | null }>,
  req: Request,
): Promise<void> {
  const entry = await repo.getJournalEntryById(userId, id);
  if (!entry) throw new NotFoundError('Journal entry not found');

  // If entryDate is changing, check for conflict
  if (patch.entryDate && patch.entryDate !== entry.entryDate) {
    const existing = await getDb()
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, userId),
          eq(journalEntries.entryDate, patch.entryDate),
          isNull(journalEntries.deletedAt),
        )
      )
      .limit(1);
    if (existing[0]) {
      throw new ConflictError('Journal entry for this date already exists');
    }
  }

  // Verify account ownership if provided
  if (patch.accountId) {
    const accountRows = await getDb()
      .select({ id: tradingAccounts.id })
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.id, patch.accountId),
          eq(tradingAccounts.userId, userId),
          isNull(tradingAccounts.deletedAt),
        )
      )
      .limit(1);
    if (!accountRows[0]) {
      throw new NotFoundError('Trading account not found');
    }
  }

  await repo.updateJournalEntry(userId, id, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'journal.update',
    entityType: 'journal_entry',
    entityId: id,
    req,
  });
}

export async function deleteJournalEntry(userId: string, id: string): Promise<void> {
  await repo.deleteJournalEntry(userId, id);
}

export interface JournalEmotionResource {
  id: string;
  journalEntryId: string;
  emotion: string;
  intensity: number;
  phase: 'before' | 'during' | 'after';
  note: string | null;
  createdAt: string;
}

export async function listJournalEmotions(
  userId: string,
  journalEntryId: string,
): Promise<JournalEmotionResource[]> {
  // Verify journal entry ownership
  const entry = await repo.getJournalEntryById(userId, journalEntryId);
  if (!entry) throw new NotFoundError('Journal entry not found');

  const emotions = await repo.listJournalEmotions(userId, journalEntryId);
  return emotions.map(e => ({
    id: e.id,
    journalEntryId: e.journalEntryId,
    emotion: e.emotion,
    intensity: e.intensity,
    phase: e.phase as 'before' | 'during' | 'after',
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function createJournalEmotion(
  userId: string,
  journalEntryId: string,
  input: { emotion: string; intensity: number; phase?: 'before' | 'during' | 'after'; note?: string | null },
  req: Request,
): Promise<{ id: string }> {
  // Verify journal entry ownership
  const entry = await repo.getJournalEntryById(userId, journalEntryId);
  if (!entry) throw new NotFoundError('Journal entry not found');

  const emotion = await repo.insertJournalEmotion(userId, journalEntryId, input);

  await writeAudit({
    actorUserId: userId,
    action: 'journal.emotion.create',
    entityType: 'journal_emotion',
    entityId: emotion.id,
    req,
  });

  return { id: emotion.id };
}

export async function updateJournalEmotion(
  userId: string,
  journalEntryId: string,
  emotionId: string,
  patch: Partial<{ emotion: string; intensity: number; phase: 'before' | 'during' | 'after'; note: string | null }>,
  req: Request,
): Promise<void> {
  // Verify journal entry ownership
  const entry = await repo.getJournalEntryById(userId, journalEntryId);
  if (!entry) throw new NotFoundError('Journal entry not found');

  await repo.updateJournalEmotion(userId, emotionId, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'journal.emotion.update',
    entityType: 'journal_emotion',
    entityId: emotionId,
    req,
  });
}

export async function deleteJournalEmotion(userId: string, journalEntryId: string, emotionId: string): Promise<void> {
  // Verify journal entry ownership
  const entry = await repo.getJournalEntryById(userId, journalEntryId);
  if (!entry) throw new NotFoundError('Journal entry not found');

  await repo.deleteJournalEmotion(userId, emotionId);
}

export interface ReviewResource {
  id: string;
  scope: 'daily' | 'weekly' | 'monthly' | 'custom';
  periodStart: string;
  periodEnd: string;
  title: string | null;
  body: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toReviewResource(review: repo.ReviewRow): ReviewResource {
  return {
    id: review.id,
    scope: review.scope,
    periodStart: review.periodStart,
    periodEnd: review.periodEnd,
    title: review.title,
    body: review.body,
    rating: review.rating ?? null,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    deletedAt: review.deletedAt?.toISOString() ?? null,
  };
}

export async function listReviews(
  userId: string,
  query: { scope?: 'daily' | 'weekly' | 'monthly' | 'custom'; periodStart?: string; periodEnd?: string; limit?: number; offset?: number },
): Promise<{ data: ReviewResource[]; meta: { limit: number; offset: number; totalCount: number } }> {
  const { data, meta } = await repo.listReviews(userId, query as { scope?: 'daily' | 'weekly' | 'monthly' | 'custom'; periodStart?: string; periodEnd?: string; limit: number; offset: number });
  return { data: data.map(toReviewResource), meta };
}

export async function getReview(userId: string, id: string): Promise<repo.ReviewRow> {
  const review = await repo.getReviewById(userId, id);
  if (!review) throw new NotFoundError('Review not found');
  return review;
}

export async function createReview(
  userId: string,
  input: { scope: 'daily' | 'weekly' | 'monthly' | 'custom'; periodStart: string; periodEnd: string; title?: string | null; body: string; rating?: number | null },
  req: Request,
): Promise<{ id: string }> {
  // Check for duplicate period
  const existing = await getDb()
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, userId),
        eq(reviews.scope, input.scope),
        eq(reviews.periodStart, input.periodStart),
        eq(reviews.periodEnd, input.periodEnd),
        isNull(reviews.deletedAt),
      )
    )
    .limit(1);

  if (existing[0]) {
    throw new ConflictError('Review for this period already exists');
  }

  const review = await repo.insertReview(userId, input);

  await writeAudit({
    actorUserId: userId,
    action: 'review.create',
    entityType: 'review',
    entityId: review.id,
    req,
  });

  return { id: review.id };
}

export async function updateReview(
  userId: string,
  id: string,
  patch: Partial<{ scope: 'daily' | 'weekly' | 'monthly' | 'custom'; periodStart: string; periodEnd: string; title: string | null; body: string; rating: number | null }>,
  req: Request,
): Promise<void> {
  const review = await repo.getReviewById(userId, id);
  if (!review) throw new NotFoundError('Review not found');

  // If period/scope is changing, check for conflict
  if ((patch.scope || patch.periodStart || patch.periodEnd) &&
    (patch.scope !== review.scope || patch.periodStart !== review.periodStart || patch.periodEnd !== review.periodEnd)) {
    const existing = await getDb()
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.userId, userId),
          eq(reviews.scope, patch.scope ?? review.scope),
          eq(reviews.periodStart, patch.periodStart ?? review.periodStart),
          eq(reviews.periodEnd, patch.periodEnd ?? review.periodEnd),
          isNull(reviews.deletedAt),
        )
      )
      .limit(1);
    if (existing[0]) {
      throw new ConflictError('Review for this period already exists');
    }
  }

  await repo.updateReview(userId, id, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'review.update',
    entityType: 'review',
    entityId: id,
    req,
  });
}

export async function deleteReview(userId: string, id: string): Promise<void> {
  await repo.deleteReview(userId, id);
}