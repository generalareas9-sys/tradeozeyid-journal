import { z } from 'zod';

/**
 * Request validation for tags (engineering-contract.md §7.7, api-spec.md §9.6).
 *
 * Every schema is `.strict()`, so an unknown key is rejected with
 * `VALIDATION_ERROR` as §1 requires.
 */

const name = z.string().min(1).max(40);

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color (e.g. #800080)').optional().nullable();

const category = z.enum(['setup', 'mistake', 'emotion', 'market', 'custom']).default('custom');

const q = z.string().max(200).optional();

const categoryFilter = z.enum(['setup', 'mistake', 'emotion', 'market', 'custom']).optional();

const withCounts = z.coerce.boolean().default(false);

const limit = z.coerce.number().int().positive().max(100).default(50);

const offset = z.coerce.number().int().nonnegative().default(0);

const sort = z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt');

const order = z.enum(['asc', 'desc']).default('desc');

/**
 * POST /tags
 */
export const createTagSchema = z
  .object({
    name,
    color,
    category,
  })
  .strict();

/**
 * PATCH /tags/:id
 */
export const patchTagSchema = z
  .object({
    name: name.optional(),
    color: color.optional(),
    category: category.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

/**
 * GET /tags query
 */
export const listTagsQuerySchema = z
  .object({
    category: categoryFilter,
    q,
    withCounts: z.coerce.boolean().default(false),
    limit,
    offset,
    sort,
    order,
  })
  .strict();

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type PatchTagInput = z.infer<typeof patchTagSchema>;
export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;