import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { trades, tradingAccounts, tradeTags, tags, strategies, tradeReviews } from '../../db/schema/trading.js';
import { journalEntries } from '../../db/schema/journal.js';
import { formatMoney } from '../../lib/money.js';

export interface DashboardMetrics {
  currency: string;
  netPnl: string;
  winRate: number;
  lossRate: number;
  profitFactor: string | null;
  averageR: string;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  bestTrade: string;
  worstTrade: string;
  averageWin: string;
  averageLoss: string;
  maxDrawdownPercent: number;
  maxDrawdownAmount: string;
  totalR: string;
}

export interface EquityPoint {
  timestamp: string;
  date: string;
  pnl: string;
  equity: string;
  drawdownPercent: number;
}

export interface DrawdownPoint {
  date: string;
  drawdownPercent: number;
}

export interface DrawdownResponse {
  maxPercent: number;
  maxAmount: string;
  peakAt: string;
  troughAt: string;
  recoveredAt: string | null;
  currentPercent: number;
  series: DrawdownPoint[];
}

export interface CalendarDay {
  date: string;
  pnl: string;
  tradeCount: number;
  winRate: number;
  rMultiple: string;
  hasJournal: boolean;
}

export interface RecentTrade {
  id: string;
  symbol: string;
  direction: string;
  entryTime: string;
  exitTime: string | null;
  pnl: string | null;
  rMultiple: string | null;
  status: string;
}

export interface SessionStats {
  key: string;
  pnl: string;
  tradeCount: number;
  winRate: number;
}

export interface BreakdownItem {
  key: string;
  secondaryKey: string | null;
  tradeCount: number;
  closedTrades: number;
  netPnl: string;
  winRate: number;
  profitFactor: string | null;
  averageR: string;
  averageWin: string;
  averageLoss: string;
}

export interface StreaksData {
  currentWinStreak: number;
  currentLossStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
  maxDrawdownStreak: number;
  winStreakHistory: Array<{
    start: string;
    end: string;
    length: number;
    pnl: string;
  }>;
  lossStreakHistory: Array<{
    start: string;
    end: string;
    length: number;
    pnl: string;
  }>;
}

export interface SessionsData {
  bySession: SessionStats[];
  byHour: Array<{
    hour: number;
    tradeCount: number;
    netPnl: string;
    winRate: number;
  }>;
}

function applyBaseFilters(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    accountId?: string | string[];
    status?: string[];
    direction?: string[];
    session?: string[];
    symbol?: string[];
    strategyId?: string[];
    tagId?: string[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    brokeRules?: boolean;
    emotionTagId?: string;
    hasAttachments?: boolean;
    q?: string;
  } = {}
) {
  const conditions = [eq(trades.userId, userId), isNull(trades.deletedAt)];

  if (options.accountId) {
    const accountIds = Array.isArray(options.accountId) ? options.accountId : [options.accountId];
    conditions.push(inArray(trades.accountId, accountIds));
  }
  if (options.from) conditions.push(gte(trades.entryTime, options.from));
  if (options.to) conditions.push(lte(trades.entryTime, options.to));
  if (options.status?.length) conditions.push(inArray(trades.status, options.status as ('planned' | 'open' | 'closed' | 'cancelled')[]));
  if (options.direction?.length) conditions.push(inArray(trades.direction, options.direction as ('long' | 'short')[]));
  if (options.session?.length) conditions.push(inArray(trades.session, options.session as ('sydney' | 'tokyo' | 'london' | 'new_york')[]));
  if (options.symbol?.length) conditions.push(inArray(trades.symbol, options.symbol));
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
    const tradeIdsWithTag = getDb()
      .select({ tradeId: tradeTags.tradeId })
      .from(tradeTags)
      .where(inArray(tradeTags.tagId, options.tagId));
    conditions.push(inArray(trades.id, tradeIdsWithTag));
  }

  if (options.emotionTagId) {
    const tradeIdsWithEmotion = getDb()
      .select({ tradeId: tradeTags.tradeId })
      .from(tradeTags)
      .innerJoin(tags, eq(tradeTags.tagId, tags.id))
      .where(and(eq(tags.id, options.emotionTagId), eq(tags.category, 'emotion')));
    conditions.push(inArray(trades.id, tradeIdsWithEmotion));
  }

  if (options.hasAttachments) {
    const tradeIdsWithAttachments = getDb()
      .select({ tradeId: trades.id })
      .from(trades)
      .where(and(eq(trades.userId, userId), isNull(trades.deletedAt)));
    conditions.push(inArray(trades.id, tradeIdsWithAttachments));
  }

  return conditions;
}

async function getFilteredTrades(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    accountId?: string;
    status?: string[];
    direction?: string[];
    session?: string[];
    symbol?: string[];
    strategyId?: string[];
    tagId?: string[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    brokeRules?: boolean;
    emotionTagId?: string;
    hasAttachments?: boolean;
    q?: string;
  } = {}
) {
  const conditions = applyBaseFilters(userId, options);
  const rows = await getDb()
    .select()
    .from(trades)
    .where(and(...conditions));
  return rows;
}

async function getFilteredClosedTrades(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    accountId?: string;
    status?: string[];
    direction?: string[];
    session?: string[];
    symbol?: string[];
    strategyId?: string[];
    tagId?: string[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    brokeRules?: boolean;
    emotionTagId?: string;
    hasAttachments?: boolean;
    q?: string;
  } = {}
) {
  const conditions = applyBaseFilters(userId, { ...options, status: ['closed'] });
  const rows = await getDb()
    .select()
    .from(trades)
    .where(and(...conditions));
  return rows;
}

export async function getDashboardMetrics(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);
  const allTrades = await getFilteredTrades(userId, { ...options, status: ['planned', 'open', 'closed', 'cancelled'] });

  if (closedTrades.length === 0) {
    const accountRows = await getDb()
      .select({ currency: tradingAccounts.currency })
      .from(tradingAccounts)
      .where(eq(tradingAccounts.userId, userId))
      .limit(1);
    const currency = accountRows[0]?.currency ?? 'USD';
    return {
      currency,
      netPnl: '0.0000000000',
      winRate: 0,
      lossRate: 0,
      profitFactor: null,
      averageR: '0.0000',
      totalTrades: allTrades.length,
      closedTrades: 0,
      openTrades: allTrades.filter(t => t.status === 'open' || t.status === 'planned').length,
      bestTrade: '0.0000000000',
      worstTrade: '0.0000000000',
      averageWin: '0.0000000000',
      averageLoss: '0.0000000000',
      maxDrawdownPercent: 0,
      maxDrawdownAmount: '0.0000000000',
      totalR: '0.0000',
    };
  }

  const wins = closedTrades.filter(t => parseFloat(t.pnl!) > 0);
  const losses = closedTrades.filter(t => parseFloat(t.pnl!) < 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const closedCount = closedTrades.length;

  const totalPnl = closedTrades.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);
  const totalR = closedTrades.reduce((sum, t) => sum + parseFloat(t.rMultiple || '0'), 0);
  const winPnlSum = wins.reduce((sum, t) => sum + parseFloat(t.pnl!), 0);
  const lossPnlSum = losses.reduce((sum, t) => sum + parseFloat(t.pnl!), 0);
  const bestTrade = Math.max(...closedTrades.map(t => parseFloat(t.pnl || '0')));
  const worstTrade = Math.min(...closedTrades.map(t => parseFloat(t.pnl || '0')));

  const accountRows = await getDb()
    .select({ currency: tradingAccounts.currency })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId))
    .limit(1);
  const currency = accountRows[0]?.currency ?? 'USD';

  const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
  const lossRate = closedCount > 0 ? (lossCount / closedCount) * 100 : 0;
  const profitFactor = lossPnlSum < 0 ? formatMoney((winPnlSum / Math.abs(lossPnlSum)).toFixed(4)) : null;
  const averageR = formatMoney((totalR / closedCount).toFixed(4));
  const averageWin = winCount > 0 ? formatMoney((winPnlSum / winCount).toFixed(10)) : '0.0000000000';
  const averageLoss = lossCount > 0 ? formatMoney((lossPnlSum / lossCount).toFixed(10)) : '0.0000000000';

  const equityCurve = await getEquityCurve(userId, { ...options, bucket: 'trade', limit: 10000 });
  let maxDrawdownPercent = 0;
  let maxDrawdownAmount = 0;
  let peak = equityCurve[0]?.equity ? parseFloat(equityCurve[0].equity) : 0;
  for (const point of equityCurve) {
    const equity = parseFloat(point.equity);
    if (equity > peak) peak = equity;
    const ddPercent = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    const ddAmount = peak - equity;
    if (ddPercent > maxDrawdownPercent) maxDrawdownPercent = ddPercent;
    if (ddAmount > maxDrawdownAmount) maxDrawdownAmount = ddAmount;
  }

  return {
    currency,
    netPnl: formatMoney(totalPnl.toFixed(10)),
    winRate: Math.round(winRate * 100) / 100,
    lossRate: Math.round(lossRate * 100) / 100,
    profitFactor,
    averageR,
    totalTrades: allTrades.length,
    closedTrades: closedCount,
    openTrades: allTrades.filter(t => t.status === 'open' || t.status === 'planned').length,
    bestTrade: formatMoney(bestTrade.toFixed(10)),
    worstTrade: formatMoney(worstTrade.toFixed(10)),
    averageWin,
    averageLoss,
    maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
    maxDrawdownAmount: formatMoney(maxDrawdownAmount.toFixed(10)),
    totalR: formatMoney(totalR.toFixed(4)),
  };
}

export async function getEquityCurve(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string; bucket: 'trade' | 'day' | 'week' | 'month'; limit: number } = { bucket: 'trade', limit: 200 }
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);
  if (closedTrades.length === 0) {
    const accountRows = await getDb()
      .select({ startingBalance: tradingAccounts.startingBalance, currency: tradingAccounts.currency })
      .from(tradingAccounts)
      .where(eq(tradingAccounts.userId, userId))
      .limit(1);
    const startingBalance = accountRows[0]?.startingBalance ?? '0';
    return [{
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      pnl: '0.0000000000',
      equity: startingBalance,
      drawdownPercent: 0,
    }];
  }

  const sortedTrades = closedTrades
    .map(t => ({
      ...t,
      exitTime: t.exitTime!,
      pnl: parseFloat(t.pnl!),
    }))
    .sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());

  const accountRows = await getDb()
    .select({ startingBalance: tradingAccounts.startingBalance, currency: tradingAccounts.currency })
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId))
    .limit(1);
  const startingBalance = parseFloat(accountRows[0]?.startingBalance ?? '0');

  let equity = startingBalance;
  let peak = startingBalance;

  if (options.bucket === 'trade') {
    const points: EquityPoint[] = [];
    for (const trade of sortedTrades) {
      equity += trade.pnl;
      if (equity > peak) peak = equity;
      const drawdownPercent = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      points.push({
        timestamp: trade.exitTime.toISOString(),
        date: trade.exitTime.toISOString().split('T')[0],
        pnl: formatMoney(trade.pnl.toFixed(10)),
        equity: formatMoney(equity.toFixed(10)),
        drawdownPercent: Math.round(drawdownPercent * 100) / 100,
      });
    }
    return points.slice(-options.limit);
  }

  const buckets: Map<string, { pnl: number; lastExitTime: Date }> = new Map();
  for (const trade of sortedTrades) {
    let key: string;
    const date = trade.exitTime;
    if (options.bucket === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (options.bucket === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    const existing = buckets.get(key) || { pnl: 0, lastExitTime: date };
    existing.pnl += trade.pnl;
    existing.lastExitTime = date;
    buckets.set(key, existing);
  }

  const points: EquityPoint[] = [];
  for (const [key, value] of Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    equity += value.pnl;
    if (equity > peak) peak = equity;
    const drawdownPercent = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    points.push({
      timestamp: value.lastExitTime.toISOString(),
      date: key,
      pnl: formatMoney(value.pnl.toFixed(10)),
      equity: formatMoney(equity.toFixed(10)),
      drawdownPercent: Math.round(drawdownPercent * 100) / 100,
    });
  }
  return points.slice(-options.limit);
}

export async function getDrawdown(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
) {
  const equityCurve = await getEquityCurve(userId, { ...options, bucket: 'day', limit: 10000 });
  let peak = equityCurve[0]?.equity ? parseFloat(equityCurve[0].equity) : 0;
  let maxPercent = 0;
  let maxAmount = 0;
  let peakAt = '';
  let troughAt = '';
  let recoveredAt = '';
  let inDrawdown = false;

  for (const point of equityCurve) {
    const equity = parseFloat(point.equity);
    if (equity > peak) {
      peak = equity;
      peakAt = point.date;
      if (inDrawdown) {
        recoveredAt = point.date;
        inDrawdown = false;
      }
    }
    const ddPercent = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    const ddAmount = peak - equity;
    if (ddPercent > maxPercent) {
      maxPercent = ddPercent;
      maxAmount = ddAmount;
      troughAt = point.date;
      inDrawdown = true;
    }
  }

  const currentPercent = equityCurve.length > 0
    ? ((peak - parseFloat(equityCurve[equityCurve.length - 1].equity)) / peak) * 100
    : 0;

  const series = equityCurve.map(p => ({
    date: p.date,
    drawdownPercent: Math.round(-p.drawdownPercent * 100) / 100,
  }));

  return {
    maxPercent: Math.round(maxPercent * 100) / 100,
    maxAmount: formatMoney(maxAmount.toFixed(10)),
    peakAt,
    troughAt,
    recoveredAt: recoveredAt || null,
    currentPercent: Math.round(currentPercent * 100) / 100,
    series,
  };
}

export async function getCalendar(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string; timezone?: string } = {}
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);
  if (closedTrades.length === 0) return [];

  const byDate: Map<string, { pnl: number; count: number; wins: number; rSum: number }> = new Map();
  for (const trade of closedTrades) {
    const date = new Date(trade.exitTime!).toISOString().split('T')[0];
    const pnl = parseFloat(trade.pnl!);
    const r = parseFloat(trade.rMultiple || '0');
    const existing = byDate.get(date) || { pnl: 0, count: 0, wins: 0, rSum: 0 };
    existing.pnl += pnl;
    existing.count += 1;
    existing.rSum += r;
    if (pnl > 0) existing.wins += 1;
    byDate.set(date, existing);
  }

  const journalDates = await getDb()
    .select({ entryDate: journalEntries.entryDate })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), isNull(journalEntries.deletedAt)));
  const journalDateSet = new Set(journalDates.map(j => j.entryDate));

  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({
      date,
      pnl: formatMoney(data.pnl.toFixed(10)),
      tradeCount: data.count,
      winRate: data.count > 0 ? Math.round((data.wins / data.count) * 100 * 100) / 100 : 0,
      rMultiple: formatMoney((data.rSum / data.count).toFixed(4)),
      hasJournal: journalDateSet.has(date),
    }));
}

export async function getRecentTrades(userId: string, limit = 10) {
  const rows = await getDb()
    .select({
      id: trades.id,
      symbol: trades.symbol,
      direction: trades.direction,
      entryTime: trades.entryTime,
      exitTime: trades.exitTime,
      pnl: trades.pnl,
      rMultiple: trades.rMultiple,
      status: trades.status,
    })
    .from(trades)
    .where(and(eq(trades.userId, userId), isNull(trades.deletedAt)))
    .orderBy(desc(trades.entryTime))
    .limit(limit);

  return rows.map(t => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    entryTime: t.entryTime.toISOString(),
    exitTime: t.exitTime?.toISOString() ?? null,
    pnl: t.pnl ?? null,
    rMultiple: t.rMultiple ?? null,
    status: t.status,
  }));
}

export async function getSessionStats(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);
  const sessions = ['sydney', 'tokyo', 'london', 'new_york'];
  return sessions.map(session => {
    const sessionTrades = closedTrades.filter(t => t.session === session);
    const count = sessionTrades.length;
    if (count === 0) return { key: session, pnl: '0.0000000000', tradeCount: 0, winRate: 0 };
    const pnlSum = sessionTrades.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);
    const wins = sessionTrades.filter(t => parseFloat(t.pnl || '0') > 0).length;
    return {
      key: session,
      pnl: formatMoney(pnlSum.toFixed(10)),
      tradeCount: count,
      winRate: Math.round((wins / count) * 100 * 100) / 100,
    };
  });
}

export async function getBreakdown(
  userId: string,
  dimension: 'day' | 'week' | 'month' | 'dayOfWeek' | 'timeOfDay' | 'strategy' | 'symbol' | 'session' | 'direction' | 'tag' | 'riskBucket' | 'streak' | 'emotion',
  options: { from?: Date; to?: Date; accountId?: string } = {}
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);
  if (closedTrades.length === 0) return [];

  const grouped = new Map<string, typeof closedTrades>();

  for (const trade of closedTrades) {
    let key = 'unknown';

    switch (dimension) {
      case 'day': {
        const date = new Date(trade.entryTime).toISOString().split('T')[0];
        key = date;
        break;
      }
      case 'week': {
        const date = new Date(trade.entryTime);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      }
      case 'month': {
        const date = new Date(trade.entryTime);
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'dayOfWeek': {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        key = dayNames[new Date(trade.entryTime).getDay()];
        break;
      }
      case 'timeOfDay': {
        const hour = new Date(trade.entryTime).getHours();
        key = `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`;
        break;
      }
      case 'strategy': {
        if (!trade.strategyId) {
          key = 'no-strategy';
        } else {
          const strat = await getDb()
            .select({ name: strategies.name })
            .from(strategies)
            .where(eq(strategies.id, trade.strategyId))
            .limit(1);
          key = strat[0]?.name ?? 'unknown';
        }
        break;
      }
      case 'symbol': {
        key = trade.symbol;
        break;
      }
      case 'session': {
        key = trade.session;
        break;
      }
      case 'direction': {
        key = trade.direction;
        break;
      }
      case 'tag': {
        const tradeTagsRows = await getDb()
          .select({ tagId: tradeTags.tagId })
          .from(tradeTags)
          .where(eq(tradeTags.tradeId, trade.id));
        if (tradeTagsRows.length === 0) {
          key = 'untagged';
        } else {
          for (const tt of tradeTagsRows) {
            const tag = await getDb()
              .select({ name: tags.name })
              .from(tags)
              .where(eq(tags.id, tt.tagId))
              .limit(1);
            key = tag[0]?.name ?? 'unknown';
            break;
          }
        }
        break;
      }
      case 'riskBucket': {
        const r = parseFloat(trade.rMultiple || '0');
        if (r <= -1) key = '<= -1R';
        else if (r <= 0) key = '-1R to 0R';
        else if (r <= 1) key = '0R to 1R';
        else if (r <= 2) key = '1R to 2R';
        else if (r <= 3) key = '2R to 3R';
        else key = '> 3R';
        break;
      }
      case 'streak': {
        key = 'streak';
        break;
      }
      case 'emotion': {
        const tradeReviewsRows = await getDb()
          .select({ fearBefore: tradeReviews.fearBefore, fomoBefore: tradeReviews.fomoBefore })
          .from(tradeReviews)
          .where(eq(tradeReviews.tradeId, trade.id))
          .limit(1);
        if (tradeReviewsRows.length > 0) {
          const review = tradeReviewsRows[0];
          if (review.fomoBefore && review.fomoBefore >= 4) key = 'FOMO';
          else if (review.fearBefore && review.fearBefore >= 4) key = 'Fear';
          else key = 'Calm';
        } else {
          key = 'No Review';
        }
        break;
      }
    }

    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(trade);
  }

  return Array.from(grouped.entries())
    .map(([key, tradesInGroup]) => {
      const count = tradesInGroup.length;
      const closedCount = tradesInGroup.filter(t => t.status === 'closed').length;
      const pnlSum = tradesInGroup.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);
      const wins = tradesInGroup.filter(t => parseFloat(t.pnl || '0') > 0);
      const losses = tradesInGroup.filter(t => parseFloat(t.pnl || '0') < 0);
      const winCount = wins.length;
      const lossCount = losses.length;
      const winPnlSum = wins.reduce((sum, t) => sum + parseFloat(t.pnl!), 0);
      const lossPnlSum = losses.reduce((sum, t) => sum + parseFloat(t.pnl!), 0);
      const rSum = tradesInGroup.reduce((sum, t) => sum + parseFloat(t.rMultiple || '0'), 0);

      return {
        key,
        secondaryKey: null,
        tradeCount: count,
        closedTrades: closedCount,
        netPnl: formatMoney(pnlSum.toFixed(10)),
        winRate: closedCount > 0 ? Math.round((winCount / closedCount) * 100 * 100) / 100 : 0,
        profitFactor: lossPnlSum < 0 ? formatMoney((winPnlSum / Math.abs(lossPnlSum)).toFixed(4)) : null,
        averageR: closedCount > 0 ? formatMoney((rSum / closedCount).toFixed(4)) : '0.0000',
        averageWin: winCount > 0 ? formatMoney((winPnlSum / winCount).toFixed(10)) : '0.0000000000',
        averageLoss: lossCount > 0 ? formatMoney((lossPnlSum / lossCount).toFixed(10)) : '0.0000000000',
      };
    })
    .sort((a, b) => parseFloat(b.netPnl) - parseFloat(a.netPnl));
}

export async function getStreaks(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);
  if (closedTrades.length === 0) {
    return {
      currentWinStreak: 0,
      currentLossStreak: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      maxDrawdownStreak: 0,
      winStreakHistory: [],
      lossStreakHistory: [],
    };
  }

  const sortedTrades = closedTrades
    .map(t => ({ ...t, exitTime: t.exitTime!, pnl: parseFloat(t.pnl!) }))
    .sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let maxDrawdownStreak = 0;
  const winStreakHistory: Array<{ start: string; end: string; length: number; pnl: string }> = [];
  const lossStreakHistory: Array<{ start: string; end: string; length: number; pnl: string }> = [];

  let winStreakStart: Date | null = null;
  let lossStreakStart: Date | null = null;
  let winStreakPnl = 0;
  let lossStreakPnl = 0;

  for (const trade of sortedTrades) {
    const isWin = trade.pnl > 0;
    const isLoss = trade.pnl < 0;

    if (isWin) {
      if (currentWinStreak === 0) {
        winStreakStart = trade.exitTime;
        winStreakPnl = trade.pnl;
      } else {
        winStreakPnl += trade.pnl;
      }
      currentWinStreak++;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      currentLossStreak = 0;
      lossStreakStart = null;
      lossStreakPnl = 0;
    } else if (isLoss) {
      if (currentLossStreak === 0) {
        lossStreakStart = trade.exitTime;
        lossStreakPnl = trade.pnl;
      } else {
        lossStreakPnl += trade.pnl;
      }
      currentLossStreak++;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      currentWinStreak = 0;
      if (winStreakStart) {
        winStreakHistory.push({
          start: winStreakStart.toISOString().split('T')[0],
          end: sortedTrades[sortedTrades.indexOf(trade) - 1].exitTime.toISOString().split('T')[0],
          length: currentWinStreak + 1,
          pnl: formatMoney(winStreakPnl.toFixed(10)),
        });
      }
      winStreakStart = null;
      winStreakPnl = 0;
    } else {
      if (winStreakStart) {
        winStreakHistory.push({
          start: winStreakStart.toISOString().split('T')[0],
          end: trade.exitTime.toISOString().split('T')[0],
          length: currentWinStreak,
          pnl: formatMoney(winStreakPnl.toFixed(10)),
        });
      }
      if (lossStreakStart) {
        lossStreakHistory.push({
          start: lossStreakStart.toISOString().split('T')[0],
          end: trade.exitTime.toISOString().split('T')[0],
          length: currentLossStreak,
          pnl: formatMoney(lossStreakPnl.toFixed(10)),
        });
      }
      currentWinStreak = 0;
      currentLossStreak = 0;
      winStreakStart = null;
      lossStreakStart = null;
      winStreakPnl = 0;
      lossStreakPnl = 0;
    }
  }

  if (winStreakStart) {
    winStreakHistory.push({
      start: winStreakStart.toISOString().split('T')[0],
      end: sortedTrades[sortedTrades.length - 1].exitTime.toISOString().split('T')[0],
      length: currentWinStreak,
      pnl: formatMoney(winStreakPnl.toFixed(10)),
    });
  }
  if (lossStreakStart) {
    lossStreakHistory.push({
      start: lossStreakStart.toISOString().split('T')[0],
      end: sortedTrades[sortedTrades.length - 1].exitTime.toISOString().split('T')[0],
      length: currentLossStreak,
      pnl: formatMoney(lossStreakPnl.toFixed(10)),
    });
  }

  const equityCurve = await getEquityCurve(userId, { ...options, bucket: 'day', limit: 10000 });
  let peak = equityCurve[0]?.equity ? parseFloat(equityCurve[0].equity) : 0;
  let ddStreak = 0;
  for (const point of equityCurve) {
    const equity = parseFloat(point.equity);
    if (equity < peak) {
      ddStreak++;
      if (ddStreak > maxDrawdownStreak) maxDrawdownStreak = ddStreak;
    } else {
      peak = equity;
      ddStreak = 0;
    }
  }

  return {
    currentWinStreak,
    currentLossStreak,
    maxWinStreak,
    maxLossStreak,
    maxDrawdownStreak,
    winStreakHistory: winStreakHistory.slice(-10),
    lossStreakHistory: lossStreakHistory.slice(-10),
  };
}

export async function getSessions(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
) {
  const closedTrades = await getFilteredClosedTrades(userId, options);

  const bySession = await getSessionStats(userId, options);

  const byHour: Map<number, { count: number; pnl: number; wins: number }> = new Map();
  for (let h = 0; h < 24; h++) {
    byHour.set(h, { count: 0, pnl: 0, wins: 0 });
  }

  for (const trade of closedTrades) {
    const hour = new Date(trade.entryTime).getHours();
    const entry = byHour.get(hour)!;
    entry.count += 1;
    entry.pnl += parseFloat(trade.pnl!);
    if (parseFloat(trade.pnl!) > 0) entry.wins += 1;
  }

  return {
    bySession,
    byHour: Array.from(byHour.entries()).map(([hour, data]) => ({
      hour,
      tradeCount: data.count,
      netPnl: formatMoney(data.pnl.toFixed(10)),
      winRate: data.count > 0 ? Math.round((data.wins / data.count) * 100 * 100) / 100 : 0,
    })),
  };
}