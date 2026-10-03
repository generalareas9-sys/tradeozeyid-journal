import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { strategyStatusEnum, tagCategoryEnum } from './enums.js';

export const strategies = pgTable(
  'strategies',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    status: strategyStatusEnum('status').notNull().default('active'),
    color: char('color', { length: 7 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    idUserUnique: unique('uq_strategies_id_user').on(table.id, table.userId),
    nameCheck: check('ck_strategies_name', sql`char_length(${table.name}) BETWEEN 1 AND 60`),
    colorCheck: check(
      'ck_strategies_color',
      sql`${table.color} IS NULL OR ${table.color} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    statusCheck: check(
      'ck_strategies_status',
      sql`${table.status} <> 'archived' OR ${table.deletedAt} IS NOT NULL`,
    ),
    nameUnique: uniqueIndex('uq_strategies_name')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    userIdx: index('idx_strategies_user')
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);

export const strategyRules = pgTable(
  'strategy_rules',
  {
    id: uuid('id').primaryKey(),
    strategyId: uuid('strategy_id')
      .notNull()
      .references(() => strategies.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    isRequired: boolean('is_required').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    positionUnique: unique('uq_strategy_rules_position').on(table.strategyId, table.position),
    positionCheck: check('ck_strategy_rules_position', sql`${table.position} >= 0`),
    textCheck: check('ck_strategy_rules_text', sql`char_length(${table.text}) BETWEEN 1 AND 500`),
  }),
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: char('color', { length: 7 }),
    category: tagCategoryEnum('category').notNull().default('custom'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    idUserUnique: unique('uq_tags_id_user').on(table.id, table.userId),
    nameCheck: check('ck_tags_name', sql`char_length(${table.name}) BETWEEN 1 AND 40`),
    colorCheck: check(
      'ck_tags_color',
      sql`${table.color} IS NULL OR ${table.color} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    nameUnique: uniqueIndex('uq_tags_name')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    userIdx: index('idx_tags_user')
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    categoryIdx: index('idx_tags_category')
      .on(table.userId, table.category)
      .where(sql`${table.deletedAt} IS NULL`),
  }),
);