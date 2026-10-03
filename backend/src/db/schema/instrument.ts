import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { accountTypeEnum } from './enums.js';

export const instrumentSpecs = pgTable(
  'instrument_specs',
  {
    id: uuid('id').primaryKey(),
    // NULL marks a global seed spec shared by every user (database-schema.md §7).
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    broker: text('broker').notNull(),
    symbol: text('symbol').notNull(),
    contractSize: numeric('contract_size', { precision: 20, scale: 10 }).notNull().default('1'),
    pipSize: numeric('pip_size', { precision: 20, scale: 10 }),
    pipValue: numeric('pip_value', { precision: 20, scale: 10 }),
    lotStep: numeric('lot_step', { precision: 20, scale: 8 }).notNull().default('0.01'),
    minLot: numeric('min_lot', { precision: 20, scale: 8 }).notNull().default('0.01'),
    maxLot: numeric('max_lot', { precision: 20, scale: 8 }).notNull().default('100.00000000'),
    currency: char('currency', { length: 3 }).notNull(),
    accountType: accountTypeEnum('account_type'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    idUserUnique: unique('uq_instrument_specs_user_id').on(table.id, table.userId),
    userSymbolUnique: uniqueIndex('uq_instrument_specs_user_symbol')
      .on(table.userId, sql`lower(${table.broker})`, sql`lower(${table.symbol})`, table.accountType)
      .where(sql`${table.userId} IS NOT NULL`),
    globalSymbolUnique: uniqueIndex('uq_instrument_specs_global_symbol')
      .on(sql`lower(${table.broker})`, sql`lower(${table.symbol})`, table.accountType)
      .where(sql`${table.userId} IS NULL`),
    lookupIdx: index('idx_instrument_specs_lookup')
      .on(sql`lower(${table.broker})`, sql`lower(${table.symbol})`)
      .where(sql`${table.userId} IS NULL`),
    symbolCheck: check(
      'ck_instrument_specs_symbol',
      sql`${table.symbol} = upper(${table.symbol}) AND char_length(${table.symbol}) BETWEEN 1 AND 24`,
    ),
    contractCheck: check('ck_instrument_specs_contract', sql`${table.contractSize} > 0`),
    pipSizeCheck: check(
      'ck_instrument_specs_pipsize',
      sql`${table.pipSize} IS NULL OR ${table.pipSize} > 0`,
    ),
    pipValueCheck: check(
      'ck_instrument_specs_pipvalue',
      sql`${table.pipValue} IS NULL OR ${table.pipValue} > 0`,
    ),
    lotStepCheck: check('ck_instrument_specs_lot_step', sql`${table.lotStep} > 0`),
    lotsCheck: check(
      'ck_instrument_specs_lots',
      sql`${table.minLot} >= ${table.lotStep} AND ${table.maxLot} >= ${table.minLot}`,
    ),
    currencyCheck: check(
      'ck_instrument_specs_currency',
      sql`${table.currency} = upper(${table.currency}) AND char_length(${table.currency}) = 3`,
    ),
  }),
);