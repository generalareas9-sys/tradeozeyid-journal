import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tokenRevokedReasonEnum, userStatusEnum } from './enums.js';
import { citext, inet } from './types.js';

export const users = pgTable(
  'users',
  {
    // ADR-008: UUIDv7 is generated in the application layer (lib/ids.ts), never
    // by a database default.
    id: uuid('id').primaryKey(),
    email: citext('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    baseCurrency: char('base_currency', { length: 3 }).notNull().default('USD'),
    locale: text('locale').notNull().default('en'),
    status: userStatusEnum('status').notNull().default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { mode: 'date' }),
    defaultRiskPercent: numeric('default_risk_percent', { precision: 6, scale: 3 })
      .notNull()
      .default('1.000'),
    lastLoginAt: timestamp('last_login_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    emailUnique: unique('uq_users_email').on(table.email),
    statusIdx: index('idx_users_status').on(table.status).where(sql`${table.deletedAt} IS NULL`),
    timezoneCheck: check('ck_users_timezone', sql`char_length(${table.timezone}) BETWEEN 1 AND 64`),
    displayNameCheck: check(
      'ck_users_display_name',
      sql`char_length(${table.displayName}) BETWEEN 1 AND 80`,
    ),
    baseCurrencyCheck: check(
      'ck_users_base_currency',
      sql`${table.baseCurrency} = upper(${table.baseCurrency}) AND char_length(${table.baseCurrency}) = 3`,
    ),
    defaultRiskCheck: check(
      'ck_users_default_risk',
      sql`${table.defaultRiskPercent} > 0 AND ${table.defaultRiskPercent} <= 100`,
    ),
  }),
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    hashUnique: unique('uq_password_reset_tokens_hash').on(table.tokenHash),
    userIdx: index('idx_password_reset_tokens_user').on(table.userId, table.createdAt.desc()),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    issuedAt: timestamp('issued_at', { mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    rotatedAt: timestamp('rotated_at', { mode: 'date' }),
    revokedAt: timestamp('revoked_at', { mode: 'date' }),
    revokedReason: tokenRevokedReasonEnum('revoked_reason'),
    userAgent: text('user_agent'),
    ip: inet('ip'),
  },
  (table) => ({
    hashUnique: unique('uq_refresh_tokens_hash').on(table.tokenHash),
    userIdx: index('idx_refresh_tokens_user').on(table.userId, table.expiresAt.desc()),
    familyIdx: index('idx_refresh_tokens_family').on(table.familyId),
    activeIdx: index('idx_refresh_tokens_active')
      .on(table.userId)
      .where(sql`${table.revokedAt} IS NULL`),
    expiryCheck: check('ck_refresh_tokens_expiry', sql`${table.expiresAt} > ${table.issuedAt}`),
  }),
);