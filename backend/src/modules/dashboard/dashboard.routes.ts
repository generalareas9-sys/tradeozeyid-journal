import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { noStore } from '../../lib/cookies.js';
import { strictBody } from '../../middleware/validate.js';
import * as service from './dashboard.service.js';
import * as exportService from './export.service.js';
import {
  dashboardQuerySchema,
  analyticsSummaryQuerySchema,
  equityCurveQuerySchema,
  drawdownQuerySchema,
  breakdownQuerySchema,
  calendarQuerySchema,
  streaksQuerySchema,
  sessionsQuerySchema,
} from './dashboard.schema.js';
import { exportRequestSchema } from './export.schema.js';

/**
 * `/dashboard` routes (api-spec.md §9.7).
 *
 * Handlers stay thin: they validate, delegate to the service and write the
 * documented envelope. No business logic lives here.
 */
const router = Router();

router.use(authMiddleware);

/** Every authenticated response is `no-store` (api-spec.md §1, §7.10). */
function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

/**
 * GET /dashboard
 *
 * Returns the full Phase 8 dashboard in one round trip.
 * 200 → { metrics, equityCurve, drawdown, calendar, recentTrades, bySession }
 */
function firstOf<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toDate(value: string | string[] | undefined): Date | undefined {
  const v = firstOf(value);
  return v ? new Date(v) : undefined;
}

function toString(value: string | string[] | undefined): string | undefined {
  return firstOf(value);
}

function toNumber(value: string | string[] | number | undefined): number | undefined {
  if (typeof value === 'number') return value;
  const v = firstOf(value);
  return v ? parseInt(v, 10) : undefined;
}

function toBucket(value: string | string[] | undefined): 'trade' | 'day' | 'week' | 'month' | undefined {
  return firstOf(value) as 'trade' | 'day' | 'week' | 'month' | undefined;
}

router.get('/', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = dashboardQuerySchema.parse(req.query);

  service
    .getDashboard(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
      timezone: toString(query.timezone),
    })
    .then((data) => sendData(res, 200, data))
    .catch(next);
});

/**
 * GET /analytics/summary
 *
 * Returns the metric block without the curve, calendar, or recent trades.
 */
router.get('/analytics/summary', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = analyticsSummaryQuerySchema.parse(req.query);

  service
    .getDashboardMetrics(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
    })
    .then((metrics) => sendData(res, 200, metrics))
    .catch(next);
});

/**
 * GET /analytics/equity-curve
 */
router.get('/analytics/equity-curve', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = equityCurveQuerySchema.parse(req.query);

  service
    .getEquityCurve(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
      bucket: toBucket(query.bucket) as 'trade' | 'day' | 'week' | 'month',
      limit: toNumber(query.limit) ?? 200,
    })
    .then((curve) => sendData(res, 200, curve))
    .catch(next);
});

/**
 * GET /analytics/drawdown
 */
router.get('/analytics/drawdown', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = drawdownQuerySchema.parse(req.query);

  service
    .getDrawdown(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
    })
    .then((drawdown) => sendData(res, 200, drawdown))
    .catch(next);
});

/**
 * GET /analytics/breakdown
 */
router.get('/analytics/breakdown', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = breakdownQuerySchema.parse(req.query);

  service
    .getBreakdown(authReq.user.id, query.dimension as 'symbol' | 'emotion' | 'direction' | 'session' | 'month' | 'day' | 'tag' | 'strategy' | 'week' | 'dayOfWeek' | 'timeOfDay' | 'riskBucket' | 'streak', {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
    })
    .then((data) => sendData(res, 200, data))
    .catch(next);
});

/**
 * GET /analytics/calendar
 */
router.get('/analytics/calendar', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = calendarQuerySchema.parse(req.query);

  service
    .getCalendar(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
      timezone: toString(query.timezone),
    })
    .then((calendar) => sendData(res, 200, calendar))
    .catch(next);
});

/**
 * GET /analytics/streaks
 */
router.get('/analytics/streaks', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = streaksQuerySchema.parse(req.query);

  service
    .getStreaks(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
    })
    .then((data) => sendData(res, 200, data))
    .catch(next);
});

/**
 * GET /analytics/sessions
 */
router.get('/analytics/sessions', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = sessionsQuerySchema.parse(req.query);

  service
    .getSessions(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
    })
    .then((data) => sendData(res, 200, data))
    .catch(next);
});

/**
 * GET /dashboard/calendar (alias for /analytics/calendar)
 */
router.get('/calendar', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const query = calendarQuerySchema.parse(req.query);

  service
    .getCalendar(authReq.user.id, {
      from: toDate(query.from),
      to: toDate(query.to),
      accountId: toString(query.accountId),
      timezone: toString(query.timezone),
    })
    .then((calendar) => sendData(res, 200, calendar))
    .catch(next);
});

/**
 * GET /dashboard/recent-trades
 */
router.get('/recent-trades', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  service
    .getRecentTrades(authReq.user.id, 10)
    .then((trades) => sendData(res, 200, trades))
    .catch(next);
});

/**
 * GET /dashboard/by-session
 */
router.get('/by-session', (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  service
    .getSessionStats(authReq.user.id, {})
    .then((data) => sendData(res, 200, data))
    .catch(next);
});

/**
 * POST /analytics/trades/export
 *
 * Exports trades as CSV with configurable columns and filters.
 * Body: { format: 'csv', columns: [...], filters: {...} }
 * Returns text/csv with Content-Disposition: attachment
 */
router.post('/analytics/trades/export', strictBody(exportRequestSchema), (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  const body = exportRequestSchema.parse(req.body);

  const from = body.filters?.from ? new Date(body.filters.from) : undefined;
  const to = body.filters?.to ? new Date(body.filters.to) : undefined;

  exportService
    .generateCsvExport(authReq.user.id, body.columns, {
      from,
      to,
      accountId: body.filters?.accountId,
      symbol: body.filters?.symbol,
      direction: body.filters?.direction,
      strategyId: body.filters?.strategyId,
      tagId: body.filters?.tagId,
      session: body.filters?.session,
      status: body.filters?.status,
      minR: body.filters?.minR,
      maxR: body.filters?.maxR,
      minPnl: body.filters?.minPnl,
      maxPnl: body.filters?.maxPnl,
      emotionTagId: body.filters?.emotionTagId,
      brokeRules: body.filters?.brokeRules,
      hasAttachments: body.filters?.hasAttachments,
      q: body.filters?.q,
      timezone: body.filters?.timezone,
      sort: 'entryTime',
      order: 'desc',
    })
    .then(({ csv, filename }) => {
      noStore(res);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    })
    .catch(next);
});

export default router;