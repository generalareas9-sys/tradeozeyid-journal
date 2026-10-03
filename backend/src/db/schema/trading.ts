import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import {
  accountStatusEnum,
  accountTypeEnum,
  attachmentKindEnum,
  executionSideEnum,
  marketSessionEnum,
  tradeDirectionEnum,
  tradeStatusEnum,
} from './enums.js';
import { strategies, tags } from './strategy.js';

export const tradingAccounts = pgTable(
  'trading_accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    broker: text('broker'),
    type: accountTypeEnum('type').notNull().default('live'),
    status: accountStatusEnum('status').notNull().default('active'),
    currency: char('currency', { length: 3 }).notNull().default('USD'),
    startingBalance: numeric('starting_balance', { precision: 20, scale: 10 }).notNull(),
    timezone: text('timezone'),
    defaultRiskPercent: numeric('default_risk_percent', { precision: 6, scale: 3 })
      .notNull()
      .default('1.000'),
    isDefault: boolean('is_default').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    idUserUnique: unique('uq_trading_accounts_id_user').on(table.id, table.userId),
    nameUnique: uniqueIndex('uq_trading_accounts_name')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    defaultUnique: uniqueIndex('uq_trading_accounts_default')
      .on(table.userId)
      .where(sql`${table.isDefault} AND ${table.deletedAt} IS NULL`),
    userIdx: index('idx_trading_accounts_user')
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    nameCheck: check('ck_trading_accounts_name', sql`char_length(${table.name}) BETWEEN 1 AND 60`),
    currencyCheck: check(
      'ck_trading_accounts_currency',
      sql`${table.currency} = upper(${table.currency}) AND char_length(${table.currency}) = 3`,
    ),
    startingCheck: check('ck_trading_accounts_starting', sql`${table.startingBalance} >= 0`),
    riskCheck: check(
      'ck_trading_accounts_risk',
      sql`${table.defaultRiskPercent} > 0 AND ${table.defaultRiskPercent} <= 100`,
    ),
    timezoneCheck: check(
      'ck_trading_accounts_timezone',
      sql`${table.timezone} IS NULL OR char_length(${table.timezone}) BETWEEN 1 AND 64`,
    ),
  }),
);

export const trades = pgTable(
  'trades',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    strategyId: uuid('strategy_id'),
    symbol: text('symbol').notNull(),
    direction: tradeDirectionEnum('direction').notNull(),
    status: tradeStatusEnum('status').notNull().default('planned'),
    session: marketSessionEnum('session').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    entryPrice: numeric('entry_price', { precision: 20, scale: 10 }).notNull(),
    exitPrice: numeric('exit_price', { precision: 20, scale: 10 }),
    stopLoss: numeric('stop_loss', { precision: 20, scale: 10 }).notNull(),
    takeProfit: numeric('take_profit', { precision: 20, scale: 10 }),
    entryTime: timestamp('entry_time', { mode: 'date' }).notNull(),
    exitTime: timestamp('exit_time', { mode: 'date' }),
    contractSize: numeric('contract_size', { precision: 20, scale: 10 }).notNull().default('1'),
    plannedRisk: numeric('planned_risk', { precision: 20, scale: 10 }).notNull(),
    riskPercent: numeric('risk_percent', { precision: 6, scale: 3 }),
    fees: numeric('fees', { precision: 20, scale: 10 }).notNull().default('0'),
    swap: numeric('swap', { precision: 20, scale: 10 }).notNull().default('0'),
    pnl: numeric('pnl', { precision: 20, scale: 10 }),
    rMultiple: numeric('r_multiple', { precision: 10, scale: 4 }),
    mae: numeric('mae', { precision: 20, scale: 10 }),
    mfe: numeric('mfe', { precision: 20, scale: 10 }),
    title: text('title'),
    mistake: text('mistake'),
    followedPlan: boolean('followed_plan'),
    brokeRules: boolean('broke_rules'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    idUserUnique: unique('uq_trades_id_user').on(table.id, table.userId),

    // Ownership by construction: a trade can never reference another user's
    // account or strategy. RESTRICT, never SET NULL, because a composite
    // SET NULL would also try to null the NOT NULL `user_id` column.
    accountOwnerFk: foreignKey({
      columns: [table.accountId, table.userId],
      foreignColumns: [tradingAccounts.id, tradingAccounts.userId],
      name: 'fk_trades_account',
    }).onDelete('restrict'),
    strategyOwnerFk: foreignKey({
      columns: [table.strategyId, table.userId],
      foreignColumns: [strategies.id, strategies.userId],
      name: 'fk_trades_strategy',
    }).onDelete('restrict'),

    userEntryIdx: index('idx_trades_user_entry').on(table.userId, table.entryTime.desc(), table.id.desc()),
    accountEntryIdx: index('idx_trades_account_entry').on(
      table.accountId,
      table.entryTime.desc(),
      table.id.desc(),
    ),
    userStatusIdx: index('idx_trades_user_status').on(table.userId, table.status),
    userSymbolIdx: index('idx_trades_user_symbol').on(table.userId, table.symbol),
    userStrategyIdx: index('idx_trades_user_strategy')
      .on(table.userId, table.strategyId)
      .where(sql`${table.strategyId} IS NOT NULL`),
    openIdx: index('idx_trades_open')
      .on(table.userId, table.entryTime.desc())
      .where(sql`${table.status} IN ('planned', 'open') AND ${table.deletedAt} IS NULL`),
    userPnlIdx: index('idx_trades_user_pnl')
      .on(table.userId, table.pnl)
      .where(sql`${table.deletedAt} IS NULL`),

    symbolCheck: check(
      'ck_trades_symbol',
      sql`${table.symbol} = upper(${table.symbol}) AND char_length(${table.symbol}) BETWEEN 1 AND 24`,
    ),
    quantityCheck: check('ck_trades_quantity', sql`${table.quantity} > 0`),
    plannedRiskCheck: check('ck_trades_planned_risk', sql`${table.plannedRisk} > 0`),
    riskPercentCheck: check(
      'ck_trades_risk_percent',
      sql`${table.riskPercent} IS NULL OR (${table.riskPercent} > 0 AND ${table.riskPercent} <= 100)`,
    ),
    feesCheck: check('ck_trades_fees', sql`${table.fees} >= 0`),
    swapCheck: check('ck_trades_swap', sql`${table.swap} = round(${table.swap}, 10)`),
    contractSizeCheck: check('ck_trades_contract_size', sql`${table.contractSize} > 0`),
    rMultipleCheck: check(
      'ck_trades_r_multiple',
      sql`${table.rMultiple} IS NULL OR ${table.rMultiple} > -1000`,
    ),
    slSideCheck: check(
      'ck_trades_sl_side',
      sql`(${table.direction} = 'long' AND ${table.stopLoss} < ${table.entryPrice}) OR (${table.direction} = 'short' AND ${table.stopLoss} > ${table.entryPrice})`,
    ),
    tpSideCheck: check(
      'ck_trades_tp_side',
      sql`${table.takeProfit} IS NULL OR (${table.direction} = 'long' AND ${table.takeProfit} > ${table.entryPrice}) OR (${table.direction} = 'short' AND ${table.takeProfit} < ${table.entryPrice})`,
    ),
    closeShapeCheck: check(
      'ck_trades_close_shape',
      sql`(${table.status} <> 'closed') OR (${table.exitPrice} IS NOT NULL AND ${table.exitTime} IS NOT NULL AND ${table.pnl} IS NOT NULL AND ${table.rMultiple} IS NOT NULL)`,
    ),
    exitOnlyWhenClosedCheck: check(
      'ck_trades_exit_only_when_closed',
      sql`(${table.exitPrice} IS NULL AND ${table.exitTime} IS NULL) OR ${table.status} IN ('closed', 'cancelled')`,
    ),
    openExitAfterEntryCheck: check(
      'ck_trades_open_exit_after_entry',
      sql`${table.exitTime} IS NULL OR ${table.exitTime} >= ${table.entryTime}`,
    ),
  }),
);

export const tradeTags = pgTable(
  'trade_tags',
  {
    tradeId: uuid('trade_id').notNull(),
    tagId: uuid('tag_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tradeId, table.tagId] }),
    tradeOwnerFk: foreignKey({
      columns: [table.tradeId, table.userId],
      foreignColumns: [trades.id, trades.userId],
      name: 'fk_trade_tags_trade',
    }).onDelete('cascade'),
    tagOwnerFk: foreignKey({
      columns: [table.tagId, table.userId],
      foreignColumns: [tags.id, tags.userId],
      name: 'fk_trade_tags_tag',
    }).onDelete('cascade'),
    tagIdx: index('idx_trade_tags_tag').on(table.tagId, table.tradeId),
    userIdx: index('idx_trade_tags_user').on(table.userId),
  }),
);

export const tradeExecutions = pgTable(
  'trade_executions',
  {
    id: uuid('id').primaryKey(),
    tradeId: uuid('trade_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    side: executionSideEnum('side').notNull(),
    price: numeric('price', { precision: 20, scale: 10 }).notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    fee: numeric('fee', { precision: 20, scale: 10 }).notNull().default('0'),
    executedAt: timestamp('executed_at', { mode: 'date' }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    seqUnique: unique('uq_trade_executions_seq').on(table.tradeId, table.sequence),
    tradeOwnerFk: foreignKey({
      columns: [table.tradeId, table.userId],
      foreignColumns: [trades.id, trades.userId],
      name: 'fk_trade_executions_trade',
    }).onDelete('cascade'),
    tradeIdx: index('idx_trade_executions_trade').on(table.tradeId, table.sequence),
    sequenceCheck: check('ck_trade_executions_sequence', sql`${table.sequence} >= 0`),
    priceCheck: check('ck_trade_executions_price', sql`${table.price} > 0`),
    quantityCheck: check('ck_trade_executions_quantity', sql`${table.quantity} > 0`),
    feeCheck: check('ck_trade_executions_fee', sql`${table.fee} >= 0`),
  }),
);

export const tradeNotes = pgTable(
  'trade_notes',
  {
    id: uuid('id').primaryKey(),
    tradeId: uuid('trade_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    tradeOwnerFk: foreignKey({
      columns: [table.tradeId, table.userId],
      foreignColumns: [trades.id, trades.userId],
      name: 'fk_trade_notes_trade',
    }).onDelete('cascade'),
    tradeIdx: index('idx_trade_notes_trade').on(table.tradeId, table.createdAt),
    bodyCheck: check('ck_trade_notes_body', sql`char_length(${table.body}) BETWEEN 1 AND 20000`),
  }),
);

export const tradeAttachments = pgTable(
  'trade_attachments',
  {
    id: uuid('id').primaryKey(),
    tradeId: uuid('trade_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: attachmentKindEnum('kind').notNull().default('screenshot'),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    checksumSha256: char('checksum_sha256', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (table) => ({
    keyUnique: unique('uq_trade_attachments_key').on(table.storageKey),
    tradeOwnerFk: foreignKey({
      columns: [table.tradeId, table.userId],
      foreignColumns: [trades.id, trades.userId],
      name: 'fk_trade_attachments_trade',
    }).onDelete('cascade'),
    tradeIdx: index('idx_trade_attachments_trade').on(table.tradeId, table.createdAt),
    sizeCheck: check(
      'ck_trade_attachments_size',
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 10485760`,
    ),
    mimeCheck: check(
      'ck_trade_attachments_mime',
      sql`${table.mimeType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    dimsCheck: check(
      'ck_trade_attachments_dims',
      sql`(${table.kind} = 'document') OR (${table.width} > 0 AND ${table.height} > 0 AND ${table.width} <= 20000 AND ${table.height} <= 20000)`,
    ),
    hashCheck: check(
      'ck_trade_attachments_hash',
      sql`${table.checksumSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  }),
);

export const tradeReviews = pgTable(
  'trade_reviews',
  {
    id: uuid('id').primaryKey(),
    tradeId: uuid('trade_id').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    confidenceBefore: smallint('confidence_before'),
    fearBefore: smallint('fear_before'),
    fomoBefore: smallint('fomo_before'),
    patienceBefore: smallint('patience_before'),
    followedPlan: boolean('followed_plan'),
    brokeRules: boolean('broke_rules'),
    revengeTrade: boolean('revenge_trade'),
    overtraded: boolean('overtraded'),
    enteredEarly: boolean('entered_early'),
    movedStop: boolean('moved_stop'),
    rulesFollowed: smallint('rules_followed'),
    rating: smallint('rating'),
    body: text('body'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    tradeOwnerFk: foreignKey({
      columns: [table.tradeId, table.userId],
      foreignColumns: [trades.id, trades.userId],
      name: 'fk_trade_reviews_trade',
    }).onDelete('cascade'),
    userIdx: index('idx_trade_reviews_user').on(table.userId),
    flagsIdx: index('idx_trade_reviews_flags')
      .on(table.userId, table.revengeTrade, table.overtraded, table.enteredEarly, table.movedStop)
      .where(sql`${table.brokeRules} IS TRUE`),
    scaleCheck: check(
      'ck_trade_reviews_scale',
      sql`
        (${table.confidenceBefore} IS NULL OR ${table.confidenceBefore} BETWEEN 1 AND 5) AND
        (${table.fearBefore} IS NULL OR ${table.fearBefore} BETWEEN 1 AND 5) AND
        (${table.fomoBefore} IS NULL OR ${table.fomoBefore} BETWEEN 1 AND 5) AND
        (${table.patienceBefore} IS NULL OR ${table.patienceBefore} BETWEEN 1 AND 5) AND
        (${table.rulesFollowed} IS NULL OR ${table.rulesFollowed} BETWEEN 0 AND 100) AND
        (${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5)
      `,
    ),
    bodyCheck: check(
      'ck_trade_reviews_body',
      sql`${table.body} IS NULL OR char_length(${table.body}) <= 20000`,
    ),
  }),
);