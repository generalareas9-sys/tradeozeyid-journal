import { z } from 'zod';

/**
 * Request validation for dashboard (engineering-contract.md §7.7, api-spec.md §9.7).
 *
 * Every schema is `.strict()`, so an unknown key is rejected with
 * `VALIDATION_ERROR` as §1 requires.
 */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const sortField = z.enum(['entryTime', 'exitTime', 'pnl', 'rMultiple', 'symbol', 'direction', 'session']).default('entryTime');
const sortOrder = z.enum(['asc', 'desc']).default('desc');

const limit = z.coerce.number().int().positive().max(100).default(50);
const cursor = z.string().optional();

const bucket = z.enum(['trade', 'day', 'week', 'month']).default('trade');
const dimension = z.enum(['day', 'week', 'month', 'dayOfWeek', 'timeOfDay', 'strategy', 'symbol', 'session', 'direction', 'tag', 'riskBucket', 'streak', 'emotion']).optional();

const statusFilter = z.array(z.enum(['planned', 'open', 'closed', 'cancelled'])).optional();
const directionFilter = z.array(z.enum(['long', 'short'])).optional();
const sessionFilter = z.array(z.enum(['sydney', 'tokyo', 'london', 'new_york'])).optional();
const symbolFilter = z.array(z.string()).optional();
const strategyIdFilter = z.array(z.string().uuid()).optional();
const tagIdFilter = z.array(z.string().uuid()).optional();
const accountIdFilter = z.array(z.string().uuid()).optional();
const fromDate = dateString.optional();
const toDate = dateString.optional();
const emotionTagIdFilter = z.string().uuid().optional();
const brokeRulesFilter = z.coerce.boolean().optional();
const hasAttachmentsFilter = z.coerce.boolean().optional();
const q = z.string().max(200).optional();
const timezone = z.string().optional();

/**
 * GET /dashboard query schema
 */
export const dashboardQuerySchema = z
  .object({
    from: fromDate,
    to: toDate,
    accountId: accountIdFilter,
    status: statusFilter,
    direction: directionFilter,
    session: sessionFilter,
    symbol: symbolFilter,
    strategyId: strategyIdFilter,
    tagId: tagIdFilter,
    fromDate,
    toDate,
    limit,
    cursor,
    sort: sortField,
    order: sortOrder,
    timezone,
    q,
    hasAttachments: hasAttachmentsFilter,
    brokeRules: brokeRulesFilter,
    emotionTagId: emotionTagIdFilter,
  })
  .strict();

/**
 * GET /analytics/summary query schema
 */
export const analyticsSummaryQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
    symbol: z.array(z.string()).optional(),
    direction: directionFilter,
    strategyId: strategyIdFilter,
    tagId: tagIdFilter,
    session: sessionFilter,
    status: statusFilter,
    minR: z.string().optional(),
    maxR: z.string().optional(),
    minPnl: z.string().optional(),
    maxPnl: z.string().optional(),
    emotionTagId: z.string().uuid().optional(),
    brokeRules: brokeRulesFilter,
    hasAttachments: hasAttachmentsFilter,
    q: z.string().max(200).optional(),
    timezone,
  })
  .strict();

/**
 * GET /analytics/equity-curve query schema
 */
export const equityCurveQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
    bucket: bucket,
    limit: z.coerce.number().int().positive().max(500).default(200),
  })
  .strict();

/**
 * GET /analytics/drawdown query schema
 */
export const drawdownQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
  })
  .strict();

/**
 * GET /analytics/breakdown query schema
 */
export const breakdownQuerySchema = z
  .object({
    dimension,
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
    status: statusFilter,
    direction: directionFilter,
    session: sessionFilter,
    symbol: symbolFilter,
    strategyId: strategyIdFilter,
    tagId: tagIdFilter,
    limit,
    sort: sortField,
    order: sortOrder,
  })
  .strict();

/**
 * GET /analytics/calendar query schema
 */
export const calendarQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
    timezone,
  })
  .strict();

/**
 * GET /analytics/streaks query schema
 */
export const streaksQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
  })
  .strict();

/**
 * GET /analytics/sessions query schema
 */
export const sessionsQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    from: fromDate,
    to: toDate,
  })
  .strict();

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type AnalyticsSummaryQuery = z.infer<typeof analyticsSummaryQuerySchema>;
export type EquityCurveQuery = z.infer<typeof equityCurveQuerySchema>;
export type DrawdownQuery = z.infer<typeof drawdownQuerySchema>;
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type StreaksQuery = z.infer<typeof streaksQuerySchema>;
export type SessionsQuery = z.infer<typeof sessionsQuerySchema>;