import { and, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { tags, tradeTags, trades } from '../../db/schema/trading.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { generateId } from '../../lib/ids.js';

/**
 * Tags data access (engineering-contract.md §5.5, §7.14).
 *
 * Every query resolves on `user_id`. `deleted_at` filtering is applied
 * automatically so soft-deleted rows are never returned unless explicitly
 * requested.
 */

export type TagRow = typeof tags.$inferSelect;

export interface TagWithCount extends TagRow {
  tradeCount: number;
}

/**
 * Lists the user's tags with optional filters.
 */
export async function listTags(
  userId: string,
  options: { category?: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom'; q?: string; withCounts?: boolean; limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc' } = {}
): Promise<typeof tags.$inferSelect[]> {
  const { category, q, withCounts = false, limit = 50, offset = 0, sort = 'createdAt', order = 'desc' } = options;

  const conditions = [eq(tags.userId, userId), isNull(tags.deletedAt)];

  if (category) conditions.push(eq(tags.category, category));
  if (q) {
    conditions.push(sql`(${tags.name} ILIKE ${`%${q}%`})`);
  }

  const orderColumn = sort === 'name' ? tags.name : sort === 'updatedAt' ? tags.updatedAt : tags.createdAt;
  const orderBy = order === 'asc' ? orderColumn : desc(orderColumn);

  const rows = await getDb()
    .select()
    .from(tags)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (!withCounts) return rows;

  // Get trade counts for all tags
  const tagIds = rows.map(t => t.id);
  if (tagIds.length === 0) return rows;

  const countResult = await getDb()
    .select({ tagId: tradeTags.tagId, count: count(trades.id).as('trade_count') })
    .from(tradeTags)
    .innerJoin(trades, and(eq(tradeTags.tradeId, trades.id), eq(trades.userId, trades.userId), isNull(trades.deletedAt)))
    .where(inArray(tradeTags.tagId, tagIds))
    .groupBy(tradeTags.tagId);

  const countMap = new Map<string, number>();
  for (const row of countResult) {
    countMap.set(row.tagId, Number(row.count));
  }

  return rows.map(tag => ({ ...tag, tradeCount: countMap.get(tag.id) ?? 0 }));
}

/**
 * Finds a single tag by ID, scoped to the user.
 */
export async function findTagById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId), isNull(tags.deletedAt)))
    .limit(1);

  return rows[0];
}

/**
 * Checks if a tag name already exists for this user (case-insensitive, among non-deleted).
 */
export async function nameExists(userId: string, name: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(
        eq(tags.userId, userId),
        eq(sql`lower(${tags.name})`, name.toLowerCase()),
        isNull(tags.deletedAt),
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Inserts a new tag.
 */
export async function insertTag(
  userId: string,
  input: { name: string; color: string | null; category: string },
) {
  const now = new Date();

  const rows = await getDb()
    .insert(tags)
    .values({
      ...input,
      id: generateId(),
      userId,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof tags.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Tag insert returned no row');

  return created;
}

/**
 * Updates a tag (PATCH).
 */
export async function updateTag(
  userId: string,
  id: string,
  patch: Partial<{ name: string; color: string | null; category: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom' }>,
) {
  // If changing name, check for duplicate (case-insensitive among non-deleted)
  if (patch.name !== undefined) {
    const duplicate = await getDb()
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.userId, userId),
          eq(sql`lower(${tags.name})`, patch.name.toLowerCase()),
          isNull(tags.deletedAt),
          ne(tags.id, id),
        )
      )
      .limit(1);

    if (duplicate.length > 0) {
      throw new ConflictError('A tag with that name already exists');
    }
  }

  const rows = await getDb()
    .update(tags)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId), isNull(tags.deletedAt)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new NotFoundError('Tag not found');

  return updated;
}

/**
 * Soft deletes a tag and its trade_tags rows in one transaction.
 */
export async function deleteTag(userId: string, id: string): Promise<void> {
  const now = new Date();

  // Delete trade_tags first
  await getDb()
    .delete(tradeTags)
    .where(and(eq(tradeTags.tagId, id), eq(tradeTags.userId, userId)));

  // Delete the tag
  const rows = await getDb()
    .update(tags)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tags.id, id), eq(tags.userId, userId), isNull(tags.deletedAt)))
    .returning({ id: tags.id });

  if (rows.length === 0) {
    throw new NotFoundError('Tag not found');
  }
}

/**
 * Finds a tag by ID for ownership checks.
 */
export async function findTagForOwnership(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId), isNull(tags.deletedAt)))
    .limit(1);

  return rows[0];
}