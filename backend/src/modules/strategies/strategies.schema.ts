import { z } from 'zod';

/**
 * Request validation for strategies and rules (engineering-contract.md §7.7, api-spec.md §9.5).
 *
 * Every schema is `.strict()`, so an unknown key is rejected with
 * `VALIDATION_ERROR` as §1 requires.
 */

const name = z.string().min(1).max(60);

const description = z.string().max(500).optional().nullable();

const category = z.string().max(60).optional().nullable();

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color (e.g. #800080)').optional().nullable();

const status = z.enum(['active', 'archived']).default('active');

const text = z.string().min(1).max(500);

const isRequired = z.boolean().default(true);

const ruleId = z.string().uuid();

const ruleIds = z.array(z.string().uuid()).min(1);

const statusFilter = z.enum(['active', 'archived']).optional();

const includeCounts = z.coerce.boolean().default(false);

const q = z.string().max(200).optional();

const limit = z.coerce.number().int().positive().max(100).default(50);

const offset = z.coerce.number().int().nonnegative().default(0);

const sort = z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt');

const order = z.enum(['asc', 'desc']).default('desc');

const withCounts = z.coerce.boolean().default(false);

/**
 * POST /strategies
 */
export const createStrategySchema = z
  .object({
    name,
    description,
    category,
    color,
    status,
  })
  .strict();

/**
 * PATCH /strategies/:id
 */
export const patchStrategySchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    category: category.optional(),
    color: color.optional(),
    status: status.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

/**
 * GET /strategies query
 */
export const listStrategiesQuerySchema = z
  .object({
    status: statusFilter,
    q,
    limit,
    offset,
    sort,
    order,
  })
  .strict();

/**
 * POST /strategies/:id/rules
 */
export const createRuleSchema = z
  .object({
    text,
    isRequired,
  })
  .strict();

/**
 * PATCH /strategies/:id/rules/:ruleId
 */
export const patchRuleSchema = z
  .object({
    text: text.optional(),
    isRequired: isRequired.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

/**
 * PUT /strategies/:id/rules/order
 */
export const reorderRulesSchema = z
  .object({
    ruleIds,
  })
  .strict();

/**
 * GET /strategies/:id/rules query
 */
export const listRulesQuerySchema = z
  .object({
    limit,
    offset,
  })
  .strict();

/**
 * PATCH /strategies/:id/rules/:ruleId
 */
export const patchRuleParamSchema = z
  .object({
    ruleId,
  })
  .strict();

export type CreateStrategyInput = z.infer<typeof createStrategySchema>;
export type PatchStrategyInput = z.infer<typeof patchStrategySchema>;
export type ListStrategiesQuery = z.infer<typeof listStrategiesQuerySchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type PatchRuleInput = z.infer<typeof patchRuleSchema>;
export type ReorderRulesInput = z.infer<typeof reorderRulesSchema>;
export type ListRulesQuery = z.infer<typeof listRulesQuerySchema>;