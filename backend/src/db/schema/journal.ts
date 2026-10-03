import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { journalScopeEnum } from './enums.js';
import { tradingAccounts } from './trading.js';

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id'),
    entryDate: date('entry_date').notNull(),
    title: text('title'),
    body: text('body').notNull().default(''),
    moodScore: smallint('mood_score'),
    wordCount: integer('word_count').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    idUserUnique: unique('uq_journal_entries_id_user').on(table.id, table.userId),

    // RESTRICT, not SET NULL: a composite SET NULL would also try to null
    // `user_id` and fail on its NOT NULL constraint.
    accountOwnerFk: foreignKey({
      columns: [table.accountId, table.userId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.userId],
      name: 'fk_journal_entries_account',
    }).onDelete('restrict'),

    dayUnique: uniqueIndex('uq_journal_entries_day')
      .on(table.userId, table.entryDate)
      .where(sql`${table.deletedAt} IS NULL`),
    userDateIdx: index('idx_journal_entries_user_date').on(table.userId, table.entryDate.desc()),
    moodCheck: check(
      'ck_journal_entries_mood',
      sql`${table.moodScore} IS NULL OR ${table.moodScore} BETWEEN 1 AND 5`,
    ),
    wordsCheck: check('ck_journal_entries_words', sql`${table.wordCount} >= 0`),
    bodyCheck: check('ck_journal_entries_body', sql`char_length(${table.body}) <= 50000`),
  }),
);

export const journalEmotions = pgTable(
  'journal_emotions',
  {
    id: uuid('id').primaryKey(),
    journalEntryId: uuid('journal_entry_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emotion: text('emotion').notNull(),
    intensity: smallint('intensity').notNull(),
    phase: text('phase').notNull().default('before'),
    note: text('note'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    entryOwnerFk: foreignKey({
      columns: [table.journalEntryId, table.userId],
      foreignColumns: [journalEntries.id, journalEntries.userId],
      name: 'fk_journal_emotions_entry',
    }).onDelete('cascade'),
    entryIdx: index('idx_journal_emotions_entry').on(table.journalEntryId),
    userIdx: index('idx_journal_emotions_user').on(table.userId, table.emotion),
    emotionCheck: check(
      'ck_journal_emotions_emotion',
      sql`char_length(${table.emotion}) BETWEEN 1 AND 60`,
    ),
    intensityCheck: check(
      'ck_journal_emotions_intensity',
      sql`${table.intensity} BETWEEN 1 AND 5`,
    ),
    phaseCheck: check(
      'ck_journal_emotions_phase',
      sql`${table.phase} IN ('before', 'during', 'after')`,
    ),
  }),
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: journalScopeEnum('scope').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    title: text('title'),
    body: text('body').notNull(),
    rating: smallint('rating'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    periodUnique: uniqueIndex('uq_reviews_period')
      .on(table.userId, table.scope, table.periodStart, table.periodEnd)
      .where(sql`${table.deletedAt} IS NULL`),
    periodCheck: check('ck_reviews_period', sql`${table.periodEnd} >= ${table.periodStart}`),
    ratingCheck: check(
      'ck_reviews_rating',
      sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`,
    ),
    bodyCheck: check('ck_reviews_body', sql`char_length(${table.body}) BETWEEN 1 AND 100000`),
  }),
);