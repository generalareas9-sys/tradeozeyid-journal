import { and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { journalEntries, journalEmotions, reviews, trades, tradingAccounts } from '../../db/schema/index.js';
import { NotFoundError } from '../../lib/errors.js';
import { generateId } from '../../lib/ids.js';
import type { ListJournalEntriesQuery, CreateJournalEntryInput, PatchJournalEntryInput, CreateJournalEmotionInput, PatchJournalEmotionInput, CreateReviewInput, PatchReviewInput, ListReviewsQuery } from './journal.schema.js';

export type JournalEntryRow = typeof journalEntries.$inferSelect;
export type JournalEmotionRow = typeof journalEmotions.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;

export interface JournalEntryWithRelations extends JournalEntryRow {
  account: { id: string; name: string; currency: string; type: string } | null;
  emotions: JournalEmotionRow[];
  tradeSummary: { tradeCount: number; netPnl: string; closedTrades: number };
}

/**
 * Journal entries data access.
 */
export async function listJournalEntries(
  userId: string,
  query: ListJournalEntriesQuery,
): Promise<{ data: JournalEntryWithRelations[]; meta: { limit: number; offset: number; totalCount: number } }> {
  const { from, to, accountId, hasEmotions, limit = 50, offset = 0 } = query;

  const conditions = [eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)];

  if (from) conditions.push(gte(journalEntries.entryDate, from));
  if (to) conditions.push(lte(journalEntries.entryDate, to));
  if (accountId) conditions.push(eq(journalEntries.accountId, accountId));

  const rows = await getDb()
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .orderBy(desc(journalEntries.entryDate))
    .limit(limit)
    .offset(offset);

  const totalRows = await getDb()
    .select({ count: count() })
    .from(journalEntries)
    .where(and(...conditions));
  const totalCount = totalRows[0]?.count ?? 0;

  const entries: JournalEntryWithRelations[] = [];

  for (const entry of rows) {
    // Get account
    let account = null;
    if (entry.accountId) {
      const accountRows = await getDb()
        .select({ id: tradingAccounts.id, name: tradingAccounts.name, currency: tradingAccounts.currency, type: tradingAccounts.type })
        .from(tradingAccounts)
        .where(eq(tradingAccounts.id, entry.accountId))
        .limit(1);
      account = accountRows[0] ?? null;
    }

    // Get emotions
    const emotions = await getDb()
      .select()
      .from(journalEmotions)
      .where(and(eq(journalEmotions.journalEntryId, entry.id), eq(journalEmotions.userId, userId)))
      .orderBy(journalEmotions.createdAt);

    // Get trade summary for the entry date
    const tradesOnDate = await getDb()
      .select({ pnl: trades.pnl, status: trades.status })
      .from(trades)
      .where(and(eq(trades.userId, userId), eq(trades.entryTime, sql`${entry.entryDate}::date`), isNull(trades.deletedAt)));

    const tradeCount = tradesOnDate.length;
    const closedTrades = tradesOnDate.filter(t => t.status === 'closed').length;
    const netPnl = tradesOnDate.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);

    entries.push({
      ...entry,
      account,
      emotions,
      tradeSummary: { tradeCount, netPnl: netPnl.toFixed(10), closedTrades },
    });
  }

  // Filter by hasEmotions if requested
  const filtered = hasEmotions ? entries.filter(e => e.emotions.length > 0) : entries;

  return { data: filtered, meta: { limit, offset, totalCount } };
}

export async function getJournalEntryById(
  userId: string,
  id: string,
): Promise<JournalEntryWithRelations | undefined> {
  const rows = await getDb()
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)))
    .limit(1);

  if (!rows[0]) return undefined;

  const entry = rows[0];

  // Get account
  let account = null;
  if (entry.accountId) {
    const accountRows = await getDb()
      .select({ id: tradingAccounts.id, name: tradingAccounts.name, currency: tradingAccounts.currency, type: tradingAccounts.type })
      .from(tradingAccounts)
      .where(eq(tradingAccounts.id, entry.accountId))
      .limit(1);
    account = accountRows[0] ?? null;
  }

  // Get emotions
  const emotions = await getDb()
    .select()
    .from(journalEmotions)
    .where(and(eq(journalEmotions.journalEntryId, entry.id), eq(journalEmotions.userId, userId)))
    .orderBy(journalEmotions.createdAt);

  // Get trade summary
  const tradesOnDate = await getDb()
    .select({ pnl: trades.pnl, status: trades.status })
    .from(trades)
    .where(and(eq(trades.userId, userId), eq(trades.entryTime, sql`${entry.entryDate}::date`), isNull(trades.deletedAt)));

  const tradeCount = tradesOnDate.length;
  const closedTrades = tradesOnDate.filter(t => t.status === 'closed').length;
  const netPnl = tradesOnDate.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);

  return {
    ...entry,
    account,
    emotions,
    tradeSummary: { tradeCount, netPnl: netPnl.toFixed(10), closedTrades },
  };
}

export async function insertJournalEntry(
  userId: string,
  input: CreateJournalEntryInput & { wordCount: number },
): Promise<JournalEntryRow> {
  const now = new Date();

  const rows = await getDb()
    .insert(journalEntries)
    .values({
      ...input,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof journalEntries.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Journal entry insert returned no row');
  return created;
}

export async function updateJournalEntry(
  userId: string,
  id: string,
  patch: PatchJournalEntryInput,
): Promise<JournalEntryRow> {
  const existing = await getDb()
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError('Journal entry not found');
  }

  const now = new Date();

  const patchValues = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );

  // Recompute wordCount if body changed
  if (patch.body !== undefined) {
    patchValues.wordCount = patch.body.trim() ? patch.body.trim().split(/\s+/).length : 0;
  }

  const rows = await getDb()
    .update(journalEntries)
    .set({ ...patchValues, updatedAt: now })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new NotFoundError('Journal entry not found');
  return updated;
}

export async function deleteJournalEntry(userId: string, id: string): Promise<void> {
  const rows = await getDb()
    .update(journalEntries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)))
    .returning({ id: journalEntries.id });

  if (rows.length === 0) {
    throw new NotFoundError('Journal entry not found');
  }
}

/**
 * Journal emotions data access.
 */
export async function listJournalEmotions(
  userId: string,
  journalEntryId: string,
): Promise<JournalEmotionRow[]> {
  return getDb()
    .select()
    .from(journalEmotions)
    .where(and(eq(journalEmotions.journalEntryId, journalEntryId), eq(journalEmotions.userId, userId)))
    .orderBy(journalEmotions.createdAt);
}

export async function insertJournalEmotion(
  userId: string,
  journalEntryId: string,
  input: CreateJournalEmotionInput,
): Promise<JournalEmotionRow> {
  const now = new Date();

  const rows = await getDb()
    .insert(journalEmotions)
    .values({
      ...input,
      id: generateId(),
      journalEntryId,
      userId,
      createdAt: now,
    } as unknown as typeof journalEmotions.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Journal emotion insert returned no row');
  return created;
}

export async function updateJournalEmotion(
  userId: string,
  emotionId: string,
  patch: PatchJournalEmotionInput,
): Promise<JournalEmotionRow> {
  const existing = await getDb()
    .select()
    .from(journalEmotions)
    .where(and(eq(journalEmotions.id, emotionId), eq(journalEmotions.userId, userId)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError('Journal emotion not found');
  }

  const patchValues = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );

  const rows = await getDb()
    .update(journalEmotions)
    .set(patchValues)
    .where(and(eq(journalEmotions.id, emotionId), eq(journalEmotions.userId, userId)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new NotFoundError('Journal emotion not found');
  return updated;
}

export async function deleteJournalEmotion(userId: string, emotionId: string): Promise<void> {
  const rows = await getDb()
    .delete(journalEmotions)
    .where(and(eq(journalEmotions.id, emotionId), eq(journalEmotions.userId, userId)))
    .returning({ id: journalEmotions.id });

  if (rows.length === 0) {
    throw new NotFoundError('Journal emotion not found');
  }
}

/**
 * Reviews data access.
 */
export async function listReviews(
  userId: string,
  query: ListReviewsQuery,
): Promise<{ data: ReviewRow[]; meta: { limit: number; offset: number; totalCount: number } }> {
  const { scope, periodStart, periodEnd, limit = 50, offset = 0 } = query;

  const conditions = [eq(reviews.userId, userId), isNull(reviews.deletedAt)];

  if (scope) conditions.push(eq(reviews.scope, scope));
  if (periodStart) conditions.push(gte(reviews.periodStart, periodStart));
  if (periodEnd) conditions.push(lte(reviews.periodEnd, periodEnd));

  const rows = await getDb()
    .select()
    .from(reviews)
    .where(and(...conditions))
    .orderBy(desc(reviews.periodStart))
    .limit(limit)
    .offset(offset);

  const totalRows = await getDb()
    .select({ count: count() })
    .from(reviews)
    .where(and(...conditions));
  const totalCount = totalRows[0]?.count ?? 0;

  return { data: rows, meta: { limit, offset, totalCount } };
}

export async function getReviewById(userId: string, id: string): Promise<ReviewRow | undefined> {
  const rows = await getDb()
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, id), eq(reviews.userId, userId), isNull(reviews.deletedAt)))
    .limit(1);

  return rows[0];
}

export async function insertReview(
  userId: string,
  input: CreateReviewInput,
): Promise<ReviewRow> {
  const now = new Date();

  const rows = await getDb()
    .insert(reviews)
    .values({
      ...input,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof reviews.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Review insert returned no row');
  return created;
}

export async function updateReview(
  userId: string,
  id: string,
  patch: PatchReviewInput,
): Promise<ReviewRow> {
  const existing = await getDb()
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, id), eq(reviews.userId, userId), isNull(reviews.deletedAt)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError('Review not found');
  }

  const now = new Date();

  const patchValues = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );

  const rows = await getDb()
    .update(reviews)
    .set({ ...patchValues, updatedAt: now })
    .where(and(eq(reviews.id, id), eq(reviews.userId, userId), isNull(reviews.deletedAt)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new NotFoundError('Review not found');
  return updated;
}

export async function deleteReview(userId: string, id: string): Promise<void> {
  const rows = await getDb()
    .update(reviews)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reviews.id, id), eq(reviews.userId, userId), isNull(reviews.deletedAt)))
    .returning({ id: reviews.id });

  if (rows.length === 0) {
    throw new NotFoundError('Review not found');
  }
}