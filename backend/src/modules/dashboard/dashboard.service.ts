import * as repo from './dashboard.repository.js';
import type {
  DashboardMetrics,
  EquityPoint,
  DrawdownResponse,
  CalendarDay,
  RecentTrade,
  SessionStats,
  BreakdownItem,
  StreaksData,
  SessionsData,
} from './dashboard.repository.js';

/**
 * Dashboard business logic (engineering-contract.md §5, api-spec.md §9.7).
 *
 * All data access goes through the repository. The service orchestrates
 * the dashboard composition from multiple data sources.
 */

export interface DashboardResource {
  metrics: DashboardMetrics;
  equityCurve: EquityPoint[];
  drawdown: DrawdownResponse;
  calendar: CalendarDay[];
  recentTrades: RecentTrade[];
  bySession: SessionStats[];
}

/**
 * Gets the full dashboard data in one round trip.
 */
export async function getDashboard(
  userId: string,
  options: {
    from?: Date;
    to?: Date;
    accountId?: string;
    timezone?: string;
  } = {}
): Promise<DashboardResource> {
  const { from, to, accountId, timezone = 'UTC' } = options;

  const [
    metrics,
    equityCurve,
    drawdown,
    calendar,
    recentTrades,
    bySession,
  ] = await Promise.all([
    repo.getDashboardMetrics(userId, { from, to, accountId }),
    repo.getEquityCurve(userId, { from, to, accountId, bucket: 'trade', limit: 200 }),
    repo.getDrawdown(userId, { from, to, accountId }),
    repo.getCalendar(userId, { from, to, accountId, timezone }),
    repo.getRecentTrades(userId, 10),
    repo.getSessionStats(userId, { from, to, accountId }),
  ]);

  return {
    metrics,
    equityCurve,
    drawdown,
    calendar,
    recentTrades,
    bySession,
  };
}

/**
 * Gets dashboard metrics only.
 */
export async function getDashboardMetrics(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
): Promise<DashboardMetrics> {
  return repo.getDashboardMetrics(userId, options);
}

/**
 * Gets equity curve.
 */
export async function getEquityCurve(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string; bucket: 'trade' | 'day' | 'week' | 'month'; limit: number } = { bucket: 'trade', limit: 200 }
): Promise<EquityPoint[]> {
  return repo.getEquityCurve(userId, options);
}

/**
 * Gets drawdown series.
 */
export async function getDrawdown(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
): Promise<DrawdownResponse> {
  return repo.getDrawdown(userId, options);
}

/**
 * Gets calendar data.
 */
export async function getCalendar(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string; timezone?: string } = {}
): Promise<CalendarDay[]> {
  return repo.getCalendar(userId, options);
}

/**
 * Gets recent trades.
 */
export async function getRecentTrades(userId: string, limit = 10): Promise<RecentTrade[]> {
  return repo.getRecentTrades(userId, limit);
}

/**
 * Gets session stats.
 */
export async function getSessionStats(userId: string, options: { from?: Date; to?: Date; accountId?: string } = {}): Promise<SessionStats[]> {
  return repo.getSessionStats(userId, options);
}

/**
 * Gets breakdown by dimension.
 */
export async function getBreakdown(
  userId: string,
  dimension: 'day' | 'week' | 'month' | 'dayOfWeek' | 'timeOfDay' | 'strategy' | 'symbol' | 'session' | 'direction' | 'tag' | 'riskBucket' | 'streak' | 'emotion',
  options: { from?: Date; to?: Date; accountId?: string } = {}
): Promise<BreakdownItem[]> {
  return repo.getBreakdown(userId, dimension, options);
}

/**
 * Gets streaks.
 */
export async function getStreaks(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
): Promise<StreaksData> {
  return repo.getStreaks(userId, options);
}

/**
 * Gets sessions.
 */
export async function getSessions(
  userId: string,
  options: { from?: Date; to?: Date; accountId?: string } = {}
): Promise<SessionsData> {
  return repo.getSessions(userId, options);
}