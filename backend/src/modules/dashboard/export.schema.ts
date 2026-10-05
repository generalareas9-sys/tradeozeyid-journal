import { z } from 'zod';

const decimal10 = z
  .string()
  .regex(/^\d+(\.\d{1,10})?$/, 'Must be a decimal string with up to 10 places');

const decimal4 = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a decimal string with up to 4 places');

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

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

export const exportColumnsSchema = z.array(z.enum([
  'id',
  'accountId',
  'accountName',
  'symbol',
  'direction',
  'status',
  'session',
  'quantity',
  'entryPrice',
  'exitPrice',
  'stopLoss',
  'takeProfit',
  'entryTime',
  'exitTime',
  'contractSize',
  'plannedRisk',
  'riskPercent',
  'fees',
  'swap',
  'pnl',
  'rMultiple',
  'mae',
  'mfe',
  'title',
  'mistake',
  'followedPlan',
  'brokeRules',
  'strategyName',
  'tags',
  'durationMinutes',
  'createdAt',
  'updatedAt',
]));

export const exportFiltersSchema = z
  .object({
    accountId: accountIdFilter,
    from: fromDate,
    to: toDate,
    symbol: symbolFilter,
    direction: directionFilter,
    strategyId: strategyIdFilter,
    tagId: tagIdFilter,
    session: sessionFilter,
    status: statusFilter,
    minR: decimal4.optional(),
    maxR: decimal4.optional(),
    minPnl: decimal10.optional(),
    maxPnl: decimal10.optional(),
    emotionTagId: emotionTagIdFilter,
    brokeRules: brokeRulesFilter,
    hasAttachments: hasAttachmentsFilter,
    q,
    timezone,
  })
  .strict();

export const exportRequestSchema = z
  .object({
    format: z.enum(['csv']).default('csv'),
    columns: exportColumnsSchema,
    filters: exportFiltersSchema.optional(),
  })
  .strict();

export type ExportColumns = z.infer<typeof exportColumnsSchema>;
export type ExportFilters = z.infer<typeof exportFiltersSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;