import { generateId } from '../../lib/ids.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { writeAudit } from '../audit/audit.service.js';
import { validateInstrumentSpec } from './trades.schema.js';
import * as repo from './trades.repository.js';
import { deriveSession } from '../../lib/time.js';
import { getDb } from '../../db/index.js';
import { tradingAccounts } from '../../db/schema/trading.js';
import { eq, isNull, and } from 'drizzle-orm';
import { pnl as computePnl, plannedRisk as computePlannedRisk, priceDelta, grossPnl, rMultiple as computeRMultiple } from '../../analytics/formulas.js';
import type { Request } from 'express';

/**
 * Trades business logic (engineering-contract.md §5, api-spec.md §9.4).
 *
 * All data access goes through the repository. The service enforces
 * the rules that span multiple operations: instrument spec resolution,
 * session derivation, planned risk computation, P&L/R-multiple on close,
 * and status transition restrictions.
 */

export interface TradeResource {
  id: string;
  accountId: string;
  account: { id: string; name: string; currency: string; type: string };
  strategyId: string | null;
  strategy: { id: string; name: string; color: string } | null;
  symbol: string;
  direction: 'long' | 'short';
  status: 'planned' | 'open' | 'closed' | 'cancelled';
  session: 'sydney' | 'tokyo' | 'london' | 'new_york';
  quantity: string;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string;
  takeProfit: string | null;
  entryTime: string;
  exitTime: string | null;
  contractSize: string;
  plannedRisk: string;
  riskPercent: number | null;
  fees: string;
  swap: string;
  pnl: string | null;
  rMultiple: string | null;
  mae: string | null;
  mfe: string | null;
  title: string | null;
  mistake: string | null;
  followedPlan: boolean | null;
  brokeRules: boolean | null;
  tags: Array<{ id: string; name: string; color: string | null; category: string }>;
  executions: Array<{ id: string; sequence: number; side: string; price: string; quantity: string; fee: string; executedAt: string }>;
  notes: Array<{ id: string; body: string; createdAt: string; updatedAt: string }>;
  attachments: Array<{ id: string; kind: string; storageKey: string; originalName: string; mimeType: string; byteSize: number; width: number | null; height: number | null; checksumSha256: string }>;
  review: { tradeId: string; confidenceBefore: number | null; fearBefore: number | null; fomoBefore: number | null; patienceBefore: number | null; followedPlan: boolean | null; brokeRules: boolean | null; revengeTrade: boolean | null; overtraded: boolean | null; enteredEarly: boolean | null; movedStop: boolean | null; rulesFollowed: number | null; rating: number | null; body: string | null } | null;
  durationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toResource(trade: repo.TradeWithRelations): TradeResource {
  return {
    id: trade.id,
    accountId: trade.accountId,
    account: trade.account,
    strategyId: trade.strategyId,
    strategy: trade.strategy,
    symbol: trade.symbol,
    direction: trade.direction,
    status: trade.status,
    session: trade.session,
    quantity: trade.quantity,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    entryTime: trade.entryTime.toISOString(),
    exitTime: trade.exitTime?.toISOString() ?? null,
    contractSize: trade.contractSize,
    plannedRisk: trade.plannedRisk,
    riskPercent: trade.riskPercent ? Number(trade.riskPercent) : null,
    fees: trade.fees,
    swap: trade.swap,
    pnl: trade.pnl,
    rMultiple: trade.rMultiple,
    mae: trade.mae,
    mfe: trade.mfe,
    title: trade.title,
    mistake: trade.mistake,
    followedPlan: trade.followedPlan,
    brokeRules: trade.brokeRules,
    tags: trade.tags.map(t => ({ id: t.id, name: t.name, color: t.color, category: t.category })),
    executions: trade.executions.map(e => ({
      id: e.id,
      sequence: e.sequence,
      side: e.side,
      price: e.price,
      quantity: e.quantity,
      fee: e.fee,
      executedAt: e.executedAt.toISOString(),
    })),
    notes: trade.notes.map(n => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() })),
    attachments: trade.attachments.map(a => ({
      id: a.id,
      kind: a.kind,
      storageKey: a.storageKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      width: a.width,
      height: a.height,
      checksumSha256: a.checksumSha256,
    })),
    review: trade.review ? {
      tradeId: trade.review.tradeId,
      confidenceBefore: trade.review.confidenceBefore,
      fearBefore: trade.review.fearBefore,
      fomoBefore: trade.review.fomoBefore,
      patienceBefore: trade.review.patienceBefore,
      followedPlan: trade.review.followedPlan,
      brokeRules: trade.review.brokeRules,
      revengeTrade: trade.review.revengeTrade,
      overtraded: trade.review.overtraded,
      enteredEarly: trade.review.enteredEarly,
      movedStop: trade.review.movedStop,
      rulesFollowed: trade.review.rulesFollowed,
      rating: trade.review.rating,
      body: trade.review.body,
    } : null,
    durationMinutes: trade.exitTime ? Math.floor((trade.exitTime.getTime() - trade.entryTime.getTime()) / 60000) : null,
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    deletedAt: trade.deletedAt?.toISOString() ?? null,
  };
}

function clientMeta(req: Request): { userAgent: string | null; ip: string | null } {
  const ua = req.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua : null,
    ip: typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null,
  };
}

/**
 * Validates SL/TP side checks per schema constraints.
 */
function validateSideChecks(
  direction: 'long' | 'short',
  entryPrice: string,
  stopLoss: string,
  takeProfit: string | null | undefined,
): void {
  const entry = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);

  if (direction === 'long') {
    if (sl >= entry) {
      throw new ValidationError([{ path: 'stopLoss', message: 'Stop loss must be below entry price for long trades' }]);
    }
  } else {
    if (sl <= entry) {
      throw new ValidationError([{ path: 'stopLoss', message: 'Stop loss must be above entry price for short trades' }]);
    }
  }

  if (takeProfit !== null && takeProfit !== undefined) {
    const tp = parseFloat(takeProfit);
    if (direction === 'long' && tp <= entry) {
      throw new ValidationError([{ path: 'takeProfit', message: 'Take profit must be above entry price for long trades' }]);
    }
    if (direction === 'short' && tp >= entry) {
      throw new ValidationError([{ path: 'takeProfit', message: 'Take profit must be below entry price for short trades' }]);
    }
  }
}

/**
 * Validates contractSize per account type rules.
 * For live accounts, contractSize must match the instrument spec exactly.
 * For demo/prop, an explicit contractSize is accepted.
 */
async function validateContractSize(
  accountType: 'live' | 'demo' | 'prop',
  providedContractSize: string | undefined,
  specContractSize: string,
): Promise<string> {
  if (accountType === 'live') {
    if (providedContractSize !== undefined) {
      throw new ValidationError([{ path: 'contractSize', message: 'Contract size is determined by the instrument spec for live accounts' }]);
    }
    return specContractSize;
  }

  return providedContractSize ?? specContractSize;
}

/**
 * Lists the user's trades with filtering, sorting, and cursor pagination.
 */
export async function listTrades(
  userId: string,
  query: { 
    accountId?: string;
    from?: string;
    to?: string;
    symbol?: string[];
    direction?: ('long' | 'short')[];
    strategyId?: string[];
    tagId?: string[];
    session?: ('sydney' | 'tokyo' | 'london' | 'new_york')[];
    status?: ('planned' | 'open' | 'closed' | 'cancelled')[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    emotionTagId?: string;
    brokeRules?: boolean;
    hasAttachments?: boolean;
    q?: string;
    timezone?: string;
    limit?: number;
    cursor?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  },
) {
  const { data, meta } = await repo.listTrades(userId, query as unknown as repo.ListTradesQuery);
  const mapped = data.map(t => ({
    id: t.id,
    accountId: t.accountId,
    symbol: t.symbol,
    direction: t.direction,
    status: t.status,
    session: t.session,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    entryTime: t.entryTime.toISOString(),
    exitTime: t.exitTime?.toISOString() ?? null,
    contractSize: t.contractSize,
    plannedRisk: t.plannedRisk,
    riskPercent: t.riskPercent ? Number(t.riskPercent) : null,
    fees: t.fees,
    swap: t.swap,
    pnl: t.pnl,
    rMultiple: t.rMultiple,
    mae: t.mae,
    mfe: t.mfe,
    title: t.title,
    mistake: t.mistake,
    followedPlan: t.followedPlan,
    brokeRules: t.brokeRules,
    tags: [],
    executions: [],
    notes: [],
    attachments: [],
    review: null,
    durationMinutes: t.exitTime ? Math.floor((t.exitTime.getTime() - t.entryTime.getTime()) / 60000) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString() ?? null,
    account: { id: '', name: '', currency: '', type: '' },
    strategyId: t.strategyId,
    strategy: null,
  }));

  return { data: mapped, meta };
}

/**
 * Gets a single trade by ID with all relations.
 */
export async function getTrade(
  userId: string,
  id: string,
): Promise<repo.TradeWithRelations> {
  const trade = await repo.getTradeById(userId, id);
  if (!trade) throw new NotFoundError('Trade not found');
  return trade;
}

/**
 * Creates a new trade.
 */
export async function createTrade(
  userId: string,
  input: {
    accountId: string;
    strategyId: string | null | undefined;
    symbol: string;
    broker: string;
    direction: 'long' | 'short';
    quantity: string;
    entryPrice: string;
    stopLoss: string;
    takeProfit: string | null | undefined;
    entryTime: string;
    status: 'planned' | 'open' | 'closed' | 'cancelled';
    contractSize?: string;
    plannedRisk?: string;
    riskPercent?: number;
    fees?: string;
    swap?: string;
    title?: string | null;
    mistake?: string | null;
    followedPlan?: boolean | null;
    brokeRules?: boolean | null;
    tagIds?: string[];
  },
  req: Request,
): Promise<{ id: string }> {
  // 1. Resolve account and verify ownership
  const accountRows = await getDb()
    .select()
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.id, input.accountId),
        eq(tradingAccounts.userId, userId),
        isNull(tradingAccounts.deletedAt),
      )
    )
    .limit(1);

  if (!accountRows[0]) {
    throw new NotFoundError('Trading account not found');
  }

  const account = accountRows[0];

  // Validate instrument spec
  const { validateInstrumentSpec } = await import('./trades.schema.js');
  const spec = await validateInstrumentSpec(userId, input.accountId, input.symbol, input.broker);

  // Currency match check
  if (spec.currency !== account.currency) {
    throw new ValidationError([{
      path: 'symbol',
      message: `${input.symbol.toUpperCase()} settles in ${spec.currency} but account ${account.id} is denominated in ${account.currency}. Currency conversion is not supported.`,
    }]);
  }

  // Validate SL/TP side checks
  validateSideChecks(input.direction, input.entryPrice, input.stopLoss, input.takeProfit);

  // Derive session from UTC clock time of entryTime
  const entryTime = new Date(input.entryTime);
  const session = deriveSession(entryTime);

  // Validate contractSize
  const contractSize = await validateContractSize(account.type, input.contractSize, spec.contractSize);

  // Compute plannedRisk
  const plannedRisk = input.plannedRisk ?? 
    (Math.abs(parseFloat(input.entryPrice) - parseFloat(input.stopLoss)) * parseFloat(input.quantity) * parseFloat(spec.contractSize)).toFixed(10);

  // Insert trade
  const trade = await repo.insertTrade(userId, {
    ...input,
    session,
    contractSize: spec.contractSize,
    plannedRisk: input.plannedRisk ?? 
      (Math.abs(parseFloat(input.entryPrice) - parseFloat(input.stopLoss)) * parseFloat(input.quantity) * parseFloat(spec.contractSize)).toFixed(10),
  } as repo.CreateTradeInput & { session: string; contractSize: string; plannedRisk: string });

  // Audit log
  await writeAudit({
    actorUserId: userId,
    action: 'trade.create',
    entityType: 'trade',
    entityId: trade.id,
    req,
  });

  return { id: trade.id };
}

/**
 * Updates a trade (PATCH) with status-based restrictions.
 */
export async function updateTrade(
  userId: string,
  id: string,
  patch: Partial<{
    symbol: string;
    broker: string;
    direction: 'long' | 'short';
    quantity: string;
    entryPrice: string;
    stopLoss: string;
    takeProfit: string | null;
    exitPrice: string | null;
    exitTime: string | null;
    status: 'planned' | 'open' | 'closed' | 'cancelled';
    contractSize: string;
    plannedRisk: string;
    riskPercent: number;
    fees: string;
    swap: string;
    title: string | null;
    mistake: string | null;
    followedPlan: boolean | null;
    brokeRules: boolean | null;
    tagIds: string[];
  }>,
  req: Request,
): Promise<void> {
  const trade = await repo.findTradeForOwnership(userId, id);
  if (!trade) throw new NotFoundError('Trade not found');

  const currentStatus = trade.status;

  if (currentStatus === 'planned') {
    // Everything allowed
  } else if (currentStatus === 'open') {
    if (patch.entryPrice !== undefined || patch.quantity !== undefined || patch.direction !== undefined) {
      throw new ValidationError([{ path: 'status', message: 'Cannot change entryPrice, quantity, or direction while trade is open' }]);
    }
  } else if (currentStatus === 'closed') {
    const allowedFields = ['title', 'mistake', 'followedPlan', 'brokeRules', 'tagIds', 'notes', 'attachments', 'review', 'fees', 'exitPrice'];
    const disallowed = Object.keys(patch).filter(k => !allowedFields.includes(k));
    if (disallowed.length > 0) {
      throw new ValidationError([{ path: 'status', message: `Cannot change ${disallowed.join(', ')} on a closed trade` }]);
    }
  } else if (currentStatus === 'cancelled') {
    const allowedFields = ['title', 'mistake', 'followedPlan', 'brokeRules', 'tagIds', 'notes', 'attachments', 'review'];
    const disallowed = Object.keys(patch).filter(k => !allowedFields.includes(k));
    if (disallowed.length > 0) {
      throw new ValidationError([{ path: 'status', message: `Cannot change ${disallowed.join(', ')} on a cancelled trade` }]);
    }
  }

  await repo.updateTrade(userId, id, patch);
}

/**
 * Closes a trade.
 */
export async function closeTrade(
  userId: string,
  id: string,
  input: { exitPrice: string; exitTime: string; fees: string; note?: string | null },
  req: Request,
): Promise<void> {
  await repo.closeTrade(userId, id, {
    exitPrice: input.exitPrice,
    exitTime: new Date(input.exitTime),
    fees: input.fees,
    note: input.note ?? null,
  });

  await writeAudit({
    actorUserId: userId,
    action: 'trade.close',
    entityType: 'trade',
    entityId: id,
    req,
  });
}

/**
 * Reopens a closed trade.
 */
export async function reopenTrade(
  userId: string,
  id: string,
  reason: string,
  req: Request,
): Promise<void> {
  await repo.reopenTrade(userId, id, reason);

  await writeAudit({
    actorUserId: userId,
    action: 'trade.reopen',
    entityType: 'trade',
    entityId: id,
    req,
    metadata: { reason },
  });
}

/**
 * Cancels a trade.
 */
export async function cancelTrade(
  userId: string,
  id: string,
  reason: string,
  req: Request,
): Promise<void> {
  await repo.cancelTrade(userId, id, reason);

  await writeAudit({
    actorUserId: userId,
    action: 'trade.cancel',
    entityType: 'trade',
    entityId: id,
    req,
    metadata: { reason },
  });
}

/**
 * Soft deletes a trade.
 */
export async function deleteTrade(userId: string, id: string): Promise<void> {
  await repo.deleteTrade(userId, id);
}

/**
 * Replaces all tags on a trade.
 */
export async function setTradeTags(
  userId: string,
  tradeId: string,
  tagIds: string[],
  req: Request,
): Promise<void> {
  await repo.setTradeTags(userId, tradeId, tagIds);

  await writeAudit({
    actorUserId: userId,
    action: 'trade.tags.set',
    entityType: 'trade',
    entityId: tradeId,
    req,
    metadata: { tagIds },
  });
}

/**
 * Removes all tags from a trade.
 */
export async function clearTradeTags(
  userId: string,
  tradeId: string,
  req: Request,
): Promise<void> {
  await repo.clearTradeTags(userId, tradeId);

  await writeAudit({
    actorUserId: userId,
    action: 'trade.tags.clear',
    entityType: 'trade',
    entityId: tradeId,
    req,
  });
}