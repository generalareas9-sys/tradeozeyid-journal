import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { trades, tradingAccounts, tradeTags, tags, strategies } from '../../db/schema/trading.js';

export type ExportColumn =
  | 'id'
  | 'accountId'
  | 'accountName'
  | 'symbol'
  | 'direction'
  | 'status'
  | 'session'
  | 'quantity'
  | 'entryPrice'
  | 'exitPrice'
  | 'stopLoss'
  | 'takeProfit'
  | 'entryTime'
  | 'exitTime'
  | 'contractSize'
  | 'plannedRisk'
  | 'riskPercent'
  | 'fees'
  | 'swap'
  | 'pnl'
  | 'rMultiple'
  | 'mae'
  | 'mfe'
  | 'title'
  | 'mistake'
  | 'followedPlan'
  | 'brokeRules'
  | 'strategyName'
  | 'tags'
  | 'durationMinutes'
  | 'createdAt'
  | 'updatedAt';

export interface ExportRow {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  direction: string;
  status: string;
  session: string;
  quantity: string;
  entryPrice: string;
  exitPrice: string | null;
  stopLoss: string;
  takeProfit: string | null;
  entryTime: Date;
  exitTime: Date | null;
  contractSize: string;
  plannedRisk: string;
  riskPercent: string | null;
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
  strategyName: string | null;
  tags: string;
  durationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

async function applyBaseFilters(
  userId: string,
  options: {
    accountId?: string | string[];
    from?: Date;
    to?: Date;
    symbol?: string[];
    direction?: string[];
    strategyId?: string[];
    tagId?: string[];
    session?: string[];
    status?: string[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    emotionTagId?: string;
    brokeRules?: boolean;
    hasAttachments?: boolean;
    q?: string;
  } = {}
): Promise<SQL<unknown>[]> {
  const conditions = [eq(trades.userId, userId), isNull(trades.deletedAt)];

  if (options.accountId) {
    const ids = Array.isArray(options.accountId) ? options.accountId : [options.accountId];
    conditions.push(inArray(trades.accountId, ids));
  }
  if (options.from) conditions.push(gte(trades.entryTime, options.from));
  if (options.to) conditions.push(lte(trades.entryTime, options.to));
  if (options.symbol?.length) conditions.push(inArray(trades.symbol, options.symbol));
  if (options.direction?.length) conditions.push(inArray(trades.direction, options.direction as ('long' | 'short')[]));
  if (options.session?.length) conditions.push(inArray(trades.session, options.session as ('sydney' | 'tokyo' | 'london' | 'new_york')[]));
  if (options.status?.length) conditions.push(inArray(trades.status, options.status as ('planned' | 'open' | 'closed' | 'cancelled')[]));
  if (options.strategyId?.length) conditions.push(inArray(trades.strategyId, options.strategyId));
  if (options.minR) conditions.push(gte(trades.rMultiple, options.minR));
  if (options.maxR) conditions.push(lte(trades.rMultiple, options.maxR));
  if (options.minPnl) conditions.push(gte(trades.pnl, options.minPnl));
  if (options.maxPnl) conditions.push(lte(trades.pnl, options.maxPnl));
  if (options.brokeRules !== undefined) conditions.push(eq(trades.brokeRules, options.brokeRules));
  if (options.q) {
    conditions.push(
      sql`(${trades.symbol} ILIKE ${`%${options.q}%`} OR ${trades.title} ILIKE ${`%${options.q}%`} OR ${trades.mistake} ILIKE ${`%${options.q}%`})`,
    );
  }

  if (options.tagId?.length) {
    const tradeIdsWithTag = await getDb()
      .select({ tradeId: tradeTags.tradeId })
      .from(tradeTags)
      .where(inArray(tradeTags.tagId, options.tagId));
    const tagTradeIds = tradeIdsWithTag.map(t => t.tradeId);
    if (tagTradeIds.length > 0) {
      conditions.push(inArray(trades.id, tagTradeIds));
    } else {
      conditions.push(sql`false`);
    }
  }

  if (options.emotionTagId) {
    const tradeIdsWithEmotion = await getDb()
      .select({ tradeId: tradeTags.tradeId })
      .from(tradeTags)
      .innerJoin(tags, eq(tradeTags.tagId, tags.id))
      .where(and(eq(tags.id, options.emotionTagId), eq(tags.category, 'emotion')));
    const emotionTradeIds = tradeIdsWithEmotion.map(t => t.tradeId);
    if (emotionTradeIds.length > 0) {
      conditions.push(inArray(trades.id, emotionTradeIds));
    } else {
      conditions.push(sql`false`);
    }
  }

  return conditions;
}

export async function getExportTrades(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    accountId?: string | string[];
    symbol?: string[];
    direction?: string[];
    strategyId?: string[];
    tagId?: string[];
    session?: string[];
    status?: string[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    emotionTagId?: string;
    brokeRules?: boolean;
    hasAttachments?: boolean;
    q?: string;
    timezone?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  } = {}
): Promise<ExportRow[]> {
  const conditions = await applyBaseFilters(userId, options);

  const sortField = options.sort ?? 'entryTime';
  const sortOrder = options.order ?? 'desc';

  const orderBy = sortOrder === 'asc'
    ? (sortField === 'entryTime' ? trades.entryTime
      : sortField === 'exitTime' ? trades.exitTime
      : sortField === 'pnl' ? trades.pnl
      : sortField === 'rMultiple' ? trades.rMultiple
      : sortField === 'symbol' ? trades.symbol
      : sortField === 'direction' ? trades.direction
      : sortField === 'session' ? trades.session
      : trades.entryTime)
    : (sortField === 'entryTime' ? desc(trades.entryTime)
      : sortField === 'exitTime' ? desc(trades.exitTime)
      : sortField === 'pnl' ? desc(trades.pnl)
      : sortField === 'rMultiple' ? desc(trades.rMultiple)
      : sortField === 'symbol' ? desc(trades.symbol)
      : sortField === 'direction' ? desc(trades.direction)
      : sortField === 'session' ? desc(trades.session)
      : desc(trades.entryTime));

  const rows = await getDb()
    .select({
      id: trades.id,
      accountId: trades.accountId,
      symbol: trades.symbol,
      direction: trades.direction,
      status: trades.status,
      session: trades.session,
      quantity: trades.quantity,
      entryPrice: trades.entryPrice,
      exitPrice: trades.exitPrice,
      stopLoss: trades.stopLoss,
      takeProfit: trades.takeProfit,
      entryTime: trades.entryTime,
      exitTime: trades.exitTime,
      contractSize: trades.contractSize,
      plannedRisk: trades.plannedRisk,
      riskPercent: trades.riskPercent,
      fees: trades.fees,
      swap: trades.swap,
      pnl: trades.pnl,
      rMultiple: trades.rMultiple,
      mae: trades.mae,
      mfe: trades.mfe,
      title: trades.title,
      mistake: trades.mistake,
      followedPlan: trades.followedPlan,
      brokeRules: trades.brokeRules,
      strategyId: trades.strategyId,
      createdAt: trades.createdAt,
      updatedAt: trades.updatedAt,
    })
    .from(trades)
    .where(and(...conditions))
    .orderBy(orderBy);

  if (rows.length === 0) return [];

  const accountIds = [...new Set(rows.map(r => r.accountId))];
  const strategyIds = [...new Set(rows.map(r => r.strategyId).filter((v): v is string => v !== null))];
  const tradeIds = rows.map(r => r.id);

  const accountRows = await getDb()
    .select({ id: tradingAccounts.id, name: tradingAccounts.name })
    .from(tradingAccounts)
    .where(inArray(tradingAccounts.id, accountIds));

  const accountMap = new Map(accountRows.map(a => [a.id, a.name]));

  const strategyRows = strategyIds.length > 0
    ? await getDb()
        .select({ id: strategies.id, name: strategies.name })
        .from(strategies)
        .where(inArray(strategies.id, strategyIds))
    : [];
  const strategyMap = new Map(strategyRows.map(s => [s.id, s.name]));

  const tagRows = await getDb()
    .select({ tradeId: tradeTags.tradeId, tagName: tags.name })
    .from(tradeTags)
    .innerJoin(tags, eq(tradeTags.tagId, tags.id))
    .where(inArray(tradeTags.tradeId, tradeIds));

  const tagsMap = new Map<string, string[]>();
  for (const tr of tagRows) {
    const existing = tagsMap.get(tr.tradeId) ?? [];
    existing.push(tr.tagName);
    tagsMap.set(tr.tradeId, existing);
  }

  return rows.map(row => ({
    ...row,
    accountName: accountMap.get(row.accountId) ?? '',
    strategyName: row.strategyId ? strategyMap.get(row.strategyId) ?? null : null,
    tags: tagsMap.get(row.id)?.join('; ') ?? '',
    riskPercent: row.riskPercent ? String(row.riskPercent) : null,
    durationMinutes: row.exitTime ? Math.floor((row.exitTime.getTime() - row.entryTime.getTime()) / 60000) : null,
  }));
}