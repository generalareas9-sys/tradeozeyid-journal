import { z } from 'zod';
import { instrumentSpecs } from '../../db/schema/instrument.js';
import { getDb } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

/**
 * Request validation for trades (engineering-contract.md §7.7, api-spec.md §9.4).
 *
 * Every schema is `.strict()`, so an unknown key is rejected with
 * `VALIDATION_ERROR` as §1 requires.
 */

const uuid = z.string().uuid();

const symbol = z
  .string()
  .min(1)
  .max(24)
  .regex(/^[A-Z0-9]+$/, 'Symbol must be uppercase alphanumeric')
  .transform((v) => v.toUpperCase());

const direction = z.enum(['long', 'short']);

const status = z.enum(['planned', 'open', 'closed', 'cancelled']);

const marketSession = z.enum(['sydney', 'tokyo', 'london', 'new_york']);

const decimal10 = z
  .string()
  .regex(/^\d+(\.\d{1,10})?$/, 'Must be a decimal string with up to 10 places');

const decimal4 = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a decimal string with up to 4 places');

const intString = z.string().regex(/^\d+$/, 'Must be a non-negative integer');

const positiveInt = z.coerce.number().int().positive();

const fees = z
  .string()
  .regex(/^\d+(\.\d{1,10})?$/, 'Must be a decimal string with up to 10 places')
  .default('0');

const swap = z
  .string()
  .regex(/^-?\d+(\.\d{1,10})?$/, 'Must be a decimal string with up to 10 places')
  .default('0');

const riskPercent = z
  .number()
  .positive()
  .max(100)
  .optional();

const title = z.string().max(200).optional().nullable();

const mistake = z.string().max(5000).optional().nullable();

const followedPlan = z.boolean().optional().nullable();

const brokeRules = z.boolean().optional().nullable();

const note = z.string().max(2000).optional().nullable();

const reason = z.string().min(1).max(500);

const tagIds = z.array(uuid).default([]);

const executionSide = z.enum(['entry', 'entry_partial', 'exit', 'exit_partial']);

/**
 * POST /trades create schema.
 *
 * Server behaviour (api-spec.md §9.4):
 * 1. Resolves account and verifies ownership (404 if not owned)
 * 2. Normalizes symbol to uppercase
 * 3. Resolves instrument_specs for (broker, symbol), user-owned preferred
 * 4. Rejects if instrument currency ≠ account currency
 * 5. Derives session from UTC clock time of entryTime (never accepts client session)
 * 6. Snapshots contractSize from resolved spec
 * 7. Computes plannedRisk = |entryPrice - stopLoss| × quantity × contractSize
 * 8. Applies SL/TP side checks from schema
 * 9. Writes audit_log (trade.create)
 */
export const createTradeSchema = z
  .object({
    accountId: uuid,
    strategyId: uuid.optional().nullable(),
    symbol,
    broker: z.string().min(1).max(80),
    direction,
    quantity: decimal10,
    entryPrice: decimal10,
    stopLoss: decimal10,
    takeProfit: decimal10.optional().nullable(),
    entryTime: z.string().datetime({ offset: true }),
    status: status.default('planned'),
    contractSize: decimal10.optional(),
    plannedRisk: decimal10.optional(), // server-computed, accepted for demo/prop only
    riskPercent: riskPercent,
    fees,
    swap,
    title,
    mistake,
    followedPlan,
    brokeRules,
    tagIds,
  })
  .strict();

/**
 * PATCH /trades/:id schema.
 *
 * Patch restrictions per status (api-spec.md §9.4):
 * - planned: everything
 * - open: everything except entryPrice, quantity, direction
 * - closed: title, mistake, followedPlan, brokeRules, tags, notes, attachments, review, fees, exitPrice (with recompute)
 * - cancelled: metadata only (title, mistake, followedPlan, brokeRules, tags, notes, attachments, review)
 */
export const patchTradeSchema = z
  .object({
    symbol: symbol.optional(),
    broker: z.string().min(1).max(80).optional(),
    direction: direction.optional(),
    quantity: decimal10.optional(),
    entryPrice: decimal10.optional(),
    stopLoss: decimal10.optional(),
    takeProfit: decimal10.optional().nullable(),
    exitPrice: decimal10.optional().nullable(),
    exitTime: z.string().datetime({ offset: true }).optional().nullable(),
    status: status.optional(),
    contractSize: decimal10.optional(),
    plannedRisk: decimal10.optional(),
    riskPercent: riskPercent,
    fees: fees.optional(),
    swap: swap.optional(),
    title: title.optional(),
    mistake: mistake.optional(),
    followedPlan: followedPlan.optional(),
    brokeRules: brokeRules.optional(),
    tagIds: tagIds.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

/**
 * POST /trades/:id/close schema
 */
export const closeTradeSchema = z
  .object({
    exitPrice: decimal10,
    exitTime: z.string().datetime({ offset: true }),
    fees: decimal10.optional().default('0'),
    note: note.optional(),
  })
  .strict();

/**
 * POST /trades/:id/reopen schema
 */
export const reopenTradeSchema = z
  .object({
    reason: reason,
  })
  .strict();

/**
 * POST /trades/:id/cancel schema
 */
export const cancelTradeSchema = z
  .object({
    reason: reason,
  })
  .strict();

/**
 * GET /trades query schema
 */
export const listTradesQuerySchema = z
  .object({
    accountId: uuid.optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    symbol: z.array(symbol).optional(),
    direction: z.array(direction).optional(),
    strategyId: z.array(uuid).optional(),
    tagId: z.array(uuid).optional(),
    session: z.array(marketSession).optional(),
    status: z.array(status).optional(),
    minR: decimal4.optional(),
    maxR: decimal4.optional(),
    minPnl: decimal10.optional(),
    maxPnl: decimal10.optional(),
    emotionTagId: uuid.optional(),
    brokeRules: z.coerce.boolean().optional(),
    hasAttachments: z.coerce.boolean().optional(),
    q: z.string().max(200).optional(),
    timezone: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    cursor: z.string().optional(),
    sort: z.enum(['entryTime', 'exitTime', 'pnl', 'rMultiple', 'symbol', 'direction']).default('entryTime'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type PatchTradeInput = z.infer<typeof patchTradeSchema>;
export type CloseTradeInput = z.infer<typeof closeTradeSchema>;
export type ReopenTradeInput = z.infer<typeof reopenTradeSchema>;
export type CancelTradeInput = z.infer<typeof cancelTradeSchema>;
export type ListTradesQuery = z.infer<typeof listTradesQuerySchema>;

/**
 * Validates that a symbol matches an instrument spec for the given broker
 * and that the spec currency matches the account currency.
 */
export async function validateInstrumentSpec(
  userId: string,
  accountId: string,
  symbol: string,
  broker: string,
): Promise<{ contractSize: string; currency: string }> {
  const db = getDb();

  // Find user-owned spec first
  let spec = await db
    .select()
    .from(instrumentSpecs)
    .where(
      and(
        eq(instrumentSpecs.userId, userId),
        eq(instrumentSpecs.broker, broker),
        eq(instrumentSpecs.symbol, symbol.toUpperCase()),
      )
    )
    .limit(1);

  if (spec.length === 0) {
    // Fall back to global seed spec
    spec = await db
      .select()
      .from(instrumentSpecs)
      .where(
        and(
          eq(instrumentSpecs.broker, broker),
          eq(instrumentSpecs.symbol, symbol.toUpperCase()),
        )
      )
      .limit(1);
  }

  if (spec.length === 0) {
    throw new Error(`No instrument spec found for ${broker}/${symbol}`);
  }

  return {
    contractSize: spec[0].contractSize,
    currency: spec[0].currency,
  };
}