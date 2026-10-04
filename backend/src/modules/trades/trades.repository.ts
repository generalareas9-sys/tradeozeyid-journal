import { and, count, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { instrumentSpecs } from '../../db/schema/instrument.js';
import { trades, tradeTags, tradeExecutions, tradeNotes, tradeAttachments, tradeReviews, tags, strategies } from '../../db/schema/trading.js';
import { tradingAccounts } from '../../db/schema/trading.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { type CreateTradeInput, type PatchTradeInput, type ListTradesQuery } from './trades.schema.js';
import { formatMoney } from '../../lib/money.js';
import { generateId } from '../../lib/ids.js';
import { deriveSession } from '../../lib/time.js';
import {
  pnl as computePnl,
  plannedRisk as computePlannedRisk,
  rMultiple as computeRMultiple,
  priceDelta,
  grossPnl,
  projectedProfit,
  actualRisk,
  rrRatio,
  exactLot,
  recommendedLot,
  flooringWarning,
  wlClassification,
  durationMinutes,
} from '../../analytics/formulas.js';

/**
 * Trades data access (engineering-contract.md §5.5, §7.14).
 *
 * Every query resolves on `user_id`. `deleted_at` filtering is applied
 * automatically so soft-deleted rows are never returned unless explicitly
 * requested.
 */

export type TradeRow = typeof trades.$inferSelect;

export interface TradeWithRelations extends TradeRow {
  account: { id: string; name: string; currency: string; type: string };
  strategy: { id: string; name: string; color: string } | null;
  executions: Array<typeof tradeExecutions.$inferSelect>;
  notes: Array<typeof tradeNotes.$inferSelect>;
  attachments: Array<typeof tradeAttachments.$inferSelect>;
  review: typeof tradeReviews.$inferSelect | null;
  tags: Array<typeof tags.$inferSelect>;
}

/**
 * Computes all derived fields for a trade row.
 */
function computeDerived(trade: TradeRow, accountCurrency: string): TradeRow & { currentPnl: string; currentRMultiple: string } {
  if (trade.status === 'closed' && trade.exitPrice && trade.pnl !== null && trade.rMultiple !== null) {
    return { ...trade, currentPnl: trade.pnl, currentRMultiple: trade.rMultiple };
  }

  // For open/planned trades, compute current P&L if we have exit price
  // (not applicable here - only closed trades have pnl/rMultiple populated)
  return { ...trade, currentPnl: trade.pnl ?? '0', currentRMultiple: trade.rMultiple ?? '0' };
}

/**
 * Lists the user's trades with filtering, sorting, and cursor pagination.
 */
export async function listTrades(
  userId: string,
  query: ListTradesQuery,
): Promise<{ data: TradeRow[]; meta: { limit: number; nextCursor: string | null; hasMore: boolean; totalCount: number | null } }> {
  const {
    accountId,
    from,
    to,
    symbol,
    direction,
    strategyId,
    tagId,
    session,
    status,
    minR,
    maxR,
    minPnl,
    maxPnl,
    emotionTagId,
    brokeRules,
    hasAttachments,
    q,
    timezone,
    limit = 50,
    cursor,
    sort = 'entryTime',
    order = 'desc',
  } = query;

  const conditions = [eq(trades.userId, userId), isNull(trades.deletedAt)];

  if (accountId) conditions.push(eq(trades.accountId, accountId));
  if (from) conditions.push(gte(trades.entryTime, new Date(from)));
  if (to) conditions.push(lte(trades.entryTime, new Date(to)));
  if (symbol?.length) conditions.push(inArray(trades.symbol, symbol));
  if (direction?.length) conditions.push(inArray(trades.direction, direction));
  if (strategyId?.length) conditions.push(inArray(trades.strategyId, strategyId));
  if (session?.length) conditions.push(inArray(trades.session, session));
  if (status?.length) conditions.push(inArray(trades.status, status));
  if (minR) conditions.push(gte(trades.rMultiple, minR));
  if (maxR) conditions.push(lte(trades.rMultiple, maxR));
  if (minPnl) conditions.push(gte(trades.pnl, minPnl));
  if (maxPnl) conditions.push(lte(trades.pnl, maxPnl));
  if (brokeRules !== undefined) conditions.push(eq(trades.brokeRules, brokeRules));
  if (q) {
    conditions.push(
      sql`(${trades.symbol} ILIKE ${`%${q}%`} OR ${trades.title} ILIKE ${`%${q}%`} OR ${trades.mistake} ILIKE ${`%${q}%`})`,
    );
  }

  if (tagId?.length) {
    const tradeIdsWithTag = await getDb()
      .select({ tradeId: tradeTags.tradeId })
      .from(tradeTags)
      .where(inArray(tradeTags.tagId, tagId));
    if (tradeIdsWithTag.length > 0) {
      conditions.push(inArray(trades.id, tradeIdsWithTag.map(t => t.tradeId)));
    } else {
      return { data: [], meta: { limit, nextCursor: null, hasMore: false, totalCount: 0 } };
    }
  }

  if (emotionTagId) {
    // Would need to join journal_emotions - skip for now
  }

  if (cursor) {
    const cursorDate = new Date(cursor);
    if (order === 'asc') {
      conditions.push(gt(trades[sort], cursorDate));
    } else {
      conditions.push(lt(trades[sort], cursorDate));
    }
  }

  const orderColumn = trades[sort] || trades.entryTime;
  const orderBy = order === 'asc' ? orderColumn : desc(orderColumn);

  const rows = await getDb()
    .select()
    .from(trades)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor = hasMore
    ? (() => {
        const val = data[data.length - 1][sort];
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'string') return val;
        return null;
      })()
    : null;

  return {
    data,
    meta: {
      limit,
      nextCursor,
      hasMore,
      totalCount: null, // cursor pagination doesn't provide total
    },
  };
}

/**
 * Gets a single trade by ID with all relations.
 */
export async function getTradeById(
  userId: string,
  id: string,
): Promise<TradeWithRelations | undefined> {
  const rows = await getDb()
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .limit(1);

  if (!rows[0]) return undefined;

  const trade = rows[0];

  // Get account
  const accountRows = await getDb()
    .select({ id: tradingAccounts.id, name: tradingAccounts.name, currency: tradingAccounts.currency, type: tradingAccounts.type })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.id, trade.accountId))
    .limit(1);

  // Get strategy
  let strategy = null;
  if (trade.strategyId) {
    const stratRows = await getDb()
      .select({ id: strategies.id, name: strategies.name, color: strategies.color })
      .from(strategies)
      .where(eq(strategies.id, trade.strategyId))
      .limit(1);
    strategy = stratRows[0] ? { ...stratRows[0], color: stratRows[0].color ?? '#000000' } : null;
  }

  // Get executions
  const executions = await getDb()
    .select()
    .from(tradeExecutions)
    .where(and(eq(tradeExecutions.tradeId, id), eq(tradeExecutions.userId, userId)))
    .orderBy(tradeExecutions.sequence);

  // Get notes
  const notes = await getDb()
    .select()
    .from(tradeNotes)
    .where(and(eq(tradeNotes.tradeId, id), eq(tradeNotes.userId, userId)))
    .orderBy(tradeNotes.createdAt);

  // Get attachments
  const attachments = await getDb()
    .select()
    .from(tradeAttachments)
    .where(and(eq(tradeAttachments.tradeId, id), eq(tradeAttachments.userId, userId)))
    .orderBy(tradeAttachments.createdAt);

  // Get review
  const reviewRows = await getDb()
    .select()
    .from(tradeReviews)
    .where(and(eq(tradeReviews.tradeId, id), eq(tradeReviews.userId, userId)))
    .limit(1);

  // Get tags
  const tagRows = await getDb()
    .select({ tag: tags })
    .from(tradeTags)
    .innerJoin(tags, eq(tradeTags.tagId, tags.id))
    .where(and(eq(tradeTags.tradeId, id), eq(tradeTags.userId, userId)));

  return {
    ...trade,
    account: accountRows[0]!,
    strategy,
    executions,
    notes,
    attachments,
    review: reviewRows[0] ?? null,
    tags: tagRows.map(t => t.tag),
  };
}

/**
 * Inserts a new trade.
 */
export async function insertTrade(
  userId: string,
  input: CreateTradeInput & { session: string; contractSize: string; plannedRisk: string },
): Promise<TradeRow> {
  const now = new Date();

  const rows = await getDb()
    .insert(trades)
    .values({
      ...input,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof trades.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Trade insert returned no row');

  // Handle tags
  if (input.tagIds?.length) {
    await getDb().insert(tradeTags).values(
      input.tagIds.map(tagId => ({
        tradeId: created.id,
        tagId,
        userId,
      })),
    );
  }

  return created;
}

/**
 * Updates a trade (PATCH).
 */
export async function updateTrade(
  userId: string,
  id: string,
  patch: PatchTradeInput,
): Promise<TradeRow> {
  // Verify ownership
  const existing = await getDb()
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .limit(1);

  if (!existing[0]) {
    throw new NotFoundError('Trade not found');
  }

  const now = new Date();

  const patchValues = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );

  const rows = await getDb()
    .update(trades)
    .set({ ...patchValues, updatedAt: now })
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .returning();

  const updated = rows[0];
  if (!updated) {
    throw new NotFoundError('Trade not found');
  }

  // Handle tag updates if provided
  if (patch.tagIds !== undefined) {
    await getDb().delete(tradeTags).where(and(eq(tradeTags.tradeId, id), eq(tradeTags.userId, userId)));
    if (patch.tagIds.length > 0) {
      await getDb().insert(tradeTags).values(
        patch.tagIds.map(tagId => ({
          tradeId: id,
          tagId,
          userId,
        })),
      );
    }
  }

  return updated;
}

/**
 * Soft deletes a trade.
 */
export async function deleteTrade(userId: string, id: string): Promise<void> {
  const rows = await getDb()
    .update(trades)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .returning({ id: trades.id });

  if (rows.length === 0) {
    throw new NotFoundError('Trade not found');
  }
}

/**
 * Closes a trade.
 */
export async function closeTrade(
  userId: string,
  id: string,
  input: { exitPrice: string; exitTime: Date; fees: string; note: string | null },
): Promise<TradeRow> {
  const trade = await getDb()
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .limit(1);

  if (!trade[0]) {
    throw new NotFoundError('Trade not found');
  }

  const t = trade[0];

  if (t.status === 'closed' || t.status === 'cancelled') {
    throw new ConflictError('Trade is already closed or cancelled');
  }

  // Compute P&L and R-multiple using canonical formulas
  const delta = priceDelta(t.entryPrice, input.exitPrice, t.direction);
  const gross = grossPnl(delta, t.quantity, t.contractSize);
  const pnlValue = computePnl(gross, input.fees, t.swap);
  const risk = computePlannedRisk(t.entryPrice, t.stopLoss, t.quantity, t.contractSize);
  const rMult = computeRMultiple(pnlValue, risk);

  const now = new Date();

  const rows = await getDb()
    .update(trades)
    .set({
      status: 'closed',
      exitPrice: input.exitPrice,
      exitTime: input.exitTime,
      fees: input.fees,
      pnl: pnlValue,
      rMultiple: rMult,
      updatedAt: now,
    })
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .returning();

  const closed = rows[0];
  if (!closed) throw new Error('Close trade returned no row');

  // Add note if provided
  if (input.note) {
    await getDb().insert(tradeNotes).values({
      id: generateId(),
      tradeId: id,
      userId,
      body: input.note,
    });
  }

  return closed;
}

/**
 * Reopens a closed trade.
 */
export async function reopenTrade(
  userId: string,
  id: string,
  reason: string,
): Promise<TradeRow> {
  const trade = await getDb()
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .limit(1);

  if (!trade[0]) {
    throw new NotFoundError('Trade not found');
  }

  const t = trade[0];

  if (t.status !== 'closed') {
    throw new ConflictError('Only closed trades can be reopened');
  }

  // Check for executions - reopen not allowed if executions exist
  const executions = await getDb()
    .select({ id: tradeExecutions.id })
    .from(tradeExecutions)
    .where(and(eq(tradeExecutions.tradeId, id), eq(tradeExecutions.userId, userId)))
    .limit(1);

  if (executions.length > 0) {
    throw new ConflictError('Cannot reopen trade with executions');
  }

  const now = new Date();

  const rows = await getDb()
    .update(trades)
    .set({
      status: 'open',
      exitPrice: null,
      exitTime: null,
      pnl: null,
      rMultiple: null,
      fees: '0',
      updatedAt: now,
    })
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .returning();

  const reopened = rows[0];
  if (!reopened) throw new Error('Reopen trade returned no row');

  // Log reason in audit_log metadata (handled by caller via audit service)

  return reopened;
}

/**
 * Cancels a planned or open trade.
 */
export async function cancelTrade(
  userId: string,
  id: string,
  reason: string,
): Promise<void> {
  const trade = await getDb()
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .limit(1);

  if (!trade[0]) {
    throw new NotFoundError('Trade not found');
  }

  const t = trade[0];

  if (t.status !== 'planned' && t.status !== 'open') {
    throw new ConflictError('Only planned or open trades can be cancelled');
  }

  await getDb()
    .update(trades)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)));

  // Log reason in audit_log metadata
}

/**
 * Finds a trade by ID for ownership checks.
 */
export async function findTradeForOwnership(userId: string, id: string): Promise<TradeRow | undefined> {
  const rows = await getDb()
    .select()
    .from(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, userId), isNull(trades.deletedAt)))
    .limit(1);

  return rows[0];
}

/**
 * Replaces all tags on a trade with the provided list.
 */
export async function setTradeTags(userId: string, tradeId: string, tagIds: string[]): Promise<void> {
  // Verify trade ownership
  const trade = await findTradeForOwnership(userId, tradeId);
  if (!trade) throw new NotFoundError('Trade not found');

  // Verify all tags exist and belong to the user
  if (tagIds.length > 0) {
    const tagRows = await getDb()
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), eq(tags.userId, userId), isNull(tags.deletedAt)));

    if (tagRows.length !== tagIds.length) {
      throw new NotFoundError('One or more tags not found');
    }
  }

  // Delete existing associations
  await getDb()
    .delete(tradeTags)
    .where(and(eq(tradeTags.tradeId, tradeId), eq(tradeTags.userId, userId)));

  // Insert new associations
  if (tagIds.length > 0) {
    await getDb().insert(tradeTags).values(
      tagIds.map(tagId => ({
        tradeId,
        tagId,
        userId,
      })),
    );
  }
}

/**
 * Removes all tags from a trade.
 */
export async function clearTradeTags(userId: string, tradeId: string): Promise<void> {
  const trade = await findTradeForOwnership(userId, tradeId);
  if (!trade) throw new NotFoundError('Trade not found');

  await getDb()
    .delete(tradeTags)
    .where(and(eq(tradeTags.tradeId, tradeId), eq(tradeTags.userId, userId)));
}

export type { CreateTradeInput, PatchTradeInput, ListTradesQuery } from './trades.schema.js';