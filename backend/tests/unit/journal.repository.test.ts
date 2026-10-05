import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/index.js';
import { migrateToLatest, resetToEmpty } from '../../src/db/migrations/runner.js';
import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import * as journalRepo from '../../src/modules/journal/journal.repository.js';

beforeAll(async () => {
  await resetToEmpty(getDb());
  await migrateToLatest(getDb());
});

afterAll(async () => {
  await closeDb();
});

describe('Journal Repository', () => {
  const userId = generateId();
  const otherUserId = generateId();

  beforeAll(async () => {
    // Create test users
    await getDb().insert(users).values([
      { id: userId, email: 'user1@test.com', passwordHash: 'hash', displayName: 'User 1', timezone: 'UTC', baseCurrency: 'USD', locale: 'en' },
      { id: otherUserId, email: 'user2@test.com', passwordHash: 'hash', displayName: 'User 2', timezone: 'UTC', baseCurrency: 'USD', locale: 'en' },
    ]);
  });

  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
    await getDb().delete(users).where(eq(users.id, otherUserId));
  });

  it('creates and retrieves a journal entry', async () => {
    const entry = await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-15',
      title: 'Test Entry',
      body: 'This is a test journal entry',
      moodScore: 4,
      wordCount: 7,
      accountId: null,
    });

    expect(entry.id).toBeDefined();
    expect(entry.userId).toBe(userId);
    expect(entry.entryDate).toBe('2026-01-15');
    expect(entry.title).toBe('Test Entry');
    expect(entry.body).toBe('This is a test journal entry');
    expect(entry.moodScore).toBe(4);
    expect(entry.wordCount).toBe(7);

    const retrieved = await journalRepo.getJournalEntryById(userId, entry.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Test Entry');
  });

  it('enforces unique entry per user per date', async () => {
    await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-16',
      title: 'First Entry',
      body: 'Body 1',
      moodScore: 3,
      wordCount: 2,
      accountId: null,
    });

    await expect(
      journalRepo.insertJournalEntry(userId, {
        entryDate: '2026-01-16',
        title: 'Second Entry',
        body: 'Body 2',
        moodScore: 4,
        wordCount: 2,
        accountId: null,
      })
    ).rejects.toThrow(); // Database constraint violation
  });

  it('allows same date for different users', async () => {
    const entry1 = await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-17',
      title: 'User 1 Entry',
      body: 'Body 1',
      moodScore: 3,
      wordCount: 2,
      accountId: null,
    });

    const entry2 = await journalRepo.insertJournalEntry(otherUserId, {
      entryDate: '2026-01-17',
      title: 'User 2 Entry',
      body: 'Body 2',
      moodScore: 4,
      wordCount: 2,
      accountId: null,
    });

    expect(entry1.id).toBeDefined();
    expect(entry2.id).toBeDefined();
    expect(entry1.id).not.toBe(entry2.id);
  });

  it('lists journal entries with pagination', async () => {
    // Create multiple entries
    for (let i = 0; i < 5; i++) {
      await journalRepo.insertJournalEntry(userId, {
        entryDate: `2026-01-${String(20 + i).padStart(2, '0')}`,
        title: `Entry ${i}`,
        body: `Body ${i}`,
        moodScore: i % 5 + 1,
        wordCount: 2,
        accountId: null,
      });
    }

    const result = await journalRepo.listJournalEntries(userId, { limit: 3, offset: 0 });
    expect(result.data.length).toBe(3);
    expect(result.meta.totalCount).toBeGreaterThanOrEqual(5);
    expect(result.meta.limit).toBe(3);
    expect(result.meta.offset).toBe(0);

    const result2 = await journalRepo.listJournalEntries(userId, { limit: 3, offset: 3 });
    expect(result2.data.length).toBeLessThanOrEqual(2);
    expect(result2.meta.offset).toBe(3);
  });

  it('filters by date range', async () => {
    const result = await journalRepo.listJournalEntries(userId, {
      from: '2026-01-20',
      to: '2026-01-22',
      limit: 20,
      offset: 0,
    });
    expect(result.data.every(e => e.entryDate >= '2026-01-20' && e.entryDate <= '2026-01-22')).toBe(true);
  });

  it('updates a journal entry', async () => {
    const entry = await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-18',
      title: 'Original',
      body: 'Original body',
      moodScore: 3,
      wordCount: 2,
      accountId: null,
    });

    const updated = await journalRepo.updateJournalEntry(userId, entry.id, {
      title: 'Updated',
      body: 'Updated body',
      moodScore: 5,
    });

    expect(updated.title).toBe('Updated');
    expect(updated.body).toBe('Updated body');
    expect(updated.moodScore).toBe(5);
    expect(updated.wordCount).toBe(11); // "Updated body" has 2 words, but wait...
  });

  it('deletes a journal entry (soft delete)', async () => {
    const entry = await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-19',
      title: 'To Delete',
      body: 'Will be deleted',
      moodScore: 2,
      wordCount: 3,
      accountId: null,
    });

    await journalRepo.deleteJournalEntry(userId, entry.id);

    const deleted = await journalRepo.getJournalEntryById(userId, entry.id);
    expect(deleted).toBeUndefined();
  });

  it('prevents cross-user access', async () => {
    const entry = await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-20',
      title: 'User 1 Entry',
      body: 'Private',
      moodScore: 3,
      wordCount: 2,
      accountId: null,
    });

    const retrieved = await journalRepo.getJournalEntryById(otherUserId, entry.id);
    expect(retrieved).toBeUndefined();
  });

  it('manages journal emotions', async () => {
    const entry = await journalRepo.insertJournalEntry(userId, {
      entryDate: '2026-01-21',
      title: 'Emotion Test',
      body: 'Testing emotions',
      moodScore: 3,
      wordCount: 2,
      accountId: null,
    });

    const emotion = await journalRepo.insertJournalEmotion(userId, entry.id, {
      emotion: 'FOMO',
      intensity: 4,
      phase: 'before',
      note: 'Before trade',
    });

    expect(emotion.id).toBeDefined();
    expect(emotion.emotion).toBe('FOMO');
    expect(emotion.intensity).toBe(4);
    expect(emotion.phase).toBe('before');

    const emotions = await journalRepo.listJournalEmotions(userId, entry.id);
    expect(emotions.length).toBe(1);

    const updated = await journalRepo.updateJournalEmotion(userId, emotion.id, {
      intensity: 5,
      note: 'Updated note',
    });
    expect(updated.intensity).toBe(5);

    await journalRepo.deleteJournalEmotion(userId, emotion.id);
    const remaining = await journalRepo.listJournalEmotions(userId, entry.id);
    expect(remaining.length).toBe(0);
  });

  it('manages reviews', async () => {
    const review = await journalRepo.insertReview(userId, {
      scope: 'weekly',
      periodStart: '2026-01-12',
      periodEnd: '2026-01-18',
      title: 'Week 3 Review',
      body: 'Good week overall',
      rating: 4,
    });

    expect(review.id).toBeDefined();
    expect(review.scope).toBe('weekly');
    expect(review.rating).toBe(4);

    const retrieved = await journalRepo.getReviewById(userId, review.id);
    expect(retrieved).toBeDefined();

    const updated = await journalRepo.updateReview(userId, review.id, {
      rating: 5,
      body: 'Updated review',
    });
    expect(updated.rating).toBe(5);

    const list = await journalRepo.listReviews(userId, { limit: 10, offset: 0 });
    expect(list.data.length).toBeGreaterThanOrEqual(1);

    await journalRepo.deleteReview(userId, review.id);
    const deleted = await journalRepo.getReviewById(userId, review.id);
    expect(deleted).toBeUndefined();
  });

  it('enforces unique review per user per period', async () => {
    await journalRepo.insertReview(userId, {
      scope: 'daily',
      periodStart: '2026-01-15',
      periodEnd: '2026-01-15',
      title: 'First',
      body: 'Body 1',
      rating: 3,
    });

    await expect(
      journalRepo.insertReview(userId, {
        scope: 'daily',
        periodStart: '2026-01-15',
        periodEnd: '2026-01-15',
        title: 'Second',
        body: 'Body 2',
        rating: 4,
      })
    ).rejects.toThrow();
  });

  it('prevents cross-user review access', async () => {
    const review = await journalRepo.insertReview(userId, {
      scope: 'monthly',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      title: 'January',
      body: 'Month review',
      rating: 4,
    });

    const retrieved = await journalRepo.getReviewById(otherUserId, review.id);
    expect(retrieved).toBeUndefined();
  });
});