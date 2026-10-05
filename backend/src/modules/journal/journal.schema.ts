import { z } from 'zod';

/**
 * Request validation for journal entries (engineering-contract.md §7.7, api-spec.md §9.10).
 */
const uuid = z.string().uuid();

const moodScore = z.number().int().min(1).max(5).optional().nullable();

const entryDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

/**
 * POST /journal/entries create schema.
 */
export const createJournalEntrySchema = z
  .object({
    entryDate,
    title: z.string().max(200).optional().nullable(),
    body: z.string().max(50000),
    moodScore,
    accountId: uuid.optional().nullable(),
  })
  .strict();

/**
 * PATCH /journal/entries/:id schema.
 */
export const patchJournalEntrySchema = z
  .object({
    entryDate: entryDate.optional(),
    title: z.string().max(200).optional().nullable(),
    body: z.string().max(50000).optional(),
    moodScore,
    accountId: uuid.optional().nullable(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

/**
 * GET /journal/entries query schema.
 */
export const listJournalEntriesQuerySchema = z
  .object({
    from: entryDate.optional(),
    to: entryDate.optional(),
    accountId: uuid.optional(),
    hasEmotions: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();

export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type PatchJournalEntryInput = z.infer<typeof patchJournalEntrySchema>;
export type ListJournalEntriesQuery = z.infer<typeof listJournalEntriesQuerySchema>;

/**
 * Journal emotions schemas.
 */
const intensity = z.number().int().min(1).max(5);
const phase = z.enum(['before', 'during', 'after']).default('before');

export const createJournalEmotionSchema = z
  .object({
    emotion: z.string().min(1).max(60),
    intensity,
    phase: phase.optional(),
    note: z.string().max(2000).optional().nullable(),
  })
  .strict();

export const patchJournalEmotionSchema = z
  .object({
    emotion: z.string().min(1).max(60).optional(),
    intensity: intensity.optional(),
    phase: phase.optional(),
    note: z.string().max(2000).optional().nullable(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

export type CreateJournalEmotionInput = z.infer<typeof createJournalEmotionSchema>;
export type PatchJournalEmotionInput = z.infer<typeof patchJournalEmotionSchema>;

/**
 * Reviews schemas.
 */
const journalScope = z.enum(['daily', 'weekly', 'monthly', 'custom']);
const rating = z.number().int().min(1).max(5).optional().nullable();

export const createReviewSchema = z
  .object({
    scope: journalScope,
    periodStart: entryDate,
    periodEnd: entryDate,
    title: z.string().max(200).optional().nullable(),
    body: z.string().min(1).max(100000),
    rating,
  })
  .strict()
  .refine((value) => value.periodEnd >= value.periodStart, {
    message: 'periodEnd must be >= periodStart',
    path: ['periodEnd'],
  });

export const patchReviewSchema = z
  .object({
    scope: journalScope.optional(),
    periodStart: entryDate.optional(),
    periodEnd: entryDate.optional(),
    title: z.string().max(200).optional().nullable(),
    body: z.string().min(1).max(100000).optional(),
    rating,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  })
  .refine((value) => !value.periodStart || !value.periodEnd || value.periodEnd >= value.periodStart, {
    message: 'periodEnd must be >= periodStart',
    path: ['periodEnd'],
  });

export const listReviewsQuerySchema = z
  .object({
    scope: journalScope.optional(),
    periodStart: entryDate.optional(),
    periodEnd: entryDate.optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type PatchReviewInput = z.infer<typeof patchReviewSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;