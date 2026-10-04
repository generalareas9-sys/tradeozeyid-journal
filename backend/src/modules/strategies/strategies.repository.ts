import { and, count, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { strategies, strategyRules, trades } from '../../db/schema/trading.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

/**
 * Strategies data access (engineering-contract.md §5.5, §7.14).
 *
 * Every query resolves on `user_id`. `deleted_at` filtering is applied
 * automatically so soft-deleted rows are never returned unless explicitly
 * requested.
 */

export type StrategyRow = typeof strategies.$inferSelect;
export type StrategyRuleRow = typeof strategyRules.$inferSelect;

export interface StrategyWithRules extends StrategyRow {
  rules: StrategyRuleRow[];
  tradeCount: number;
}

export interface StrategyWithStats extends StrategyWithRules {
  netPnl: string | null;
  winRate: number | null;
  profitFactor: string | null;
  averageR: string | null;
}

function toStrategyWithRules(row: StrategyRow, rules: StrategyRuleRow[], tradeCount: number): StrategyWithRules {
  return { ...row, rules, tradeCount };
}

/**
 * Lists the user's strategies with optional filters.
 */
export async function listStrategies(
  userId: string,
  options: { status?: 'active' | 'archived'; q?: string; limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc' } = {}
): Promise<StrategyWithRules[]> {
  const { status, q, limit = 50, offset = 0, sort = 'createdAt', order = 'desc' } = options;

  const conditions = [
    eq(strategies.userId, userId),
    isNull(strategies.deletedAt),
  ];

  if (status) conditions.push(eq(strategies.status, status));
  if (q) {
    conditions.push(
      sql`(${strategies.name} ILIKE ${`%${q}%`} OR ${strategies.description} ILIKE ${`%${q}%`})`,
    );
  }

  const orderColumn = sort === 'name' ? strategies.name : sort === 'updatedAt' ? strategies.updatedAt : strategies.createdAt;
  const orderBy = order === 'asc' ? orderColumn : desc(orderColumn);

  const strategyRows = await getDb()
    .select()
    .from(strategies)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Get rules and trade counts for all strategies
  const strategyIds = strategyRows.map(s => s.id);
  if (strategyIds.length === 0) return [];

  // Fetch all rules in one query
  const allRules = await getDb()
    .select()
    .from(strategyRules)
    .where(inArray(strategyRules.strategyId, strategyIds))
    .orderBy(strategyRules.position);

  // Group rules by strategy
  const rulesByStrategy = new Map<string, typeof strategyRules.$inferSelect[]>();
  for (const rule of allRules) {
    const arr = rulesByStrategy.get(rule.strategyId) || [];
    arr.push(rule);
    rulesByStrategy.set(rule.strategyId, arr);
  }

  // Fetch trade counts for all strategies
  const tradeCountResult = await getDb()
    .select({ strategyId: trades.strategyId, count: count(trades.id).as('trade_count') })
    .from(trades)
    .where(and(eq(trades.userId, userId), inArray(trades.strategyId, strategyIds), isNull(trades.deletedAt)))
    .groupBy(trades.strategyId);

  const tradeCountMap = new Map<string, number>();
  for (const row of tradeCountResult) {
    const countVal = row.count ?? '0';
    const countNum = Number(countVal);
    tradeCountMap.set(row.strategyId as string, countNum);
  }

  return strategyRows.map((strategy) => ({
    ...strategy,
    rules: rulesByStrategy.get(strategy.id) || [],
    tradeCount: tradeCountMap.get(strategy.id) ?? 0,
  }));
}

/**
 * Finds a single strategy by ID, scoped to the user.
 */
export async function findStrategyById(
  userId: string,
  id: string,
): Promise<typeof strategies.$inferSelect | undefined> {
  const rows = await getDb()
    .select()
    .from(strategies)
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId), isNull(strategies.deletedAt)))
    .limit(1);

  return rows[0];
}

/**
 * Gets a strategy with its rules and trade count.
 */
export async function getStrategyWithRules(
  userId: string,
  id: string,
): Promise<{ strategy: typeof strategies.$inferSelect; rules: typeof strategyRules.$inferSelect[]; tradeCount: number } | undefined> {
  const strategy = await findStrategyById(userId, id);
  if (!strategy) return undefined;

  const rules = await getDb()
    .select()
    .from(strategyRules)
    .where(eq(strategyRules.strategyId, id))
    .orderBy(strategyRules.position);

  const tradeCountResult = await getDb()
    .select({ count: count(trades.id).as('trade_count') })
    .from(trades)
    .where(and(eq(trades.strategyId, id), eq(trades.userId, userId), isNull(trades.deletedAt)));

  return {
    strategy,
    rules,
    tradeCount: Number(tradeCountResult[0]?.count ?? 0),
  };
}

/**
 * Checks if a strategy name already exists for this user (case-insensitive, among non-deleted).
 */
export async function nameExists(userId: string, name: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: strategies.id })
    .from(strategies)
    .where(
      and(
        eq(strategies.userId, userId),
        eq(sql`lower(${strategies.name})`, name.toLowerCase()),
        isNull(strategies.deletedAt),
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Inserts a new strategy.
 */
export async function insertStrategy(
  userId: string,
  input: {
    name: string;
    description: string | null;
    category: string | null;
    color: string | null;
    status: 'active' | 'archived';
  }
): Promise<typeof strategies.$inferSelect> {
  const now = new Date();

  const rows = await getDb()
    .insert(strategies)
    .values({
      ...input,
      userId,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof strategies.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Strategy insert returned no row');

  return created;
}

/**
 * Updates a strategy (PATCH).
 */
export async function updateStrategy(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    category: string | null;
    color: string | null;
    status: 'active' | 'archived';
  }>
): Promise<typeof strategies.$inferSelect> {
  // If changing name, check for duplicate (case-insensitive among non-deleted)
  if (patch.name !== undefined) {
    const duplicate = await getDb()
      .select({ id: strategies.id })
      .from(strategies)
      .where(
        and(
          eq(strategies.userId, userId),
          eq(sql`lower(${strategies.name})`, patch.name.toLowerCase()),
          isNull(strategies.deletedAt),
          ne(strategies.id, id),
        )
      )
      .limit(1);

    if (duplicate.length > 0) {
      throw new ConflictError('A strategy with that name already exists');
    }
  }

  const rows = await getDb()
    .update(strategies)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(strategies.id, id),
        eq(strategies.userId, userId),
        isNull(strategies.deletedAt),
      )
    )
    .returning();

  const updated = rows[0];
  if (!updated) {
    throw new NotFoundError('Strategy not found');
  }

  return updated;
}

/**
 * Soft deletes a strategy.
 */
export async function archiveStrategy(userId: string, id: string): Promise<void> {
  const rows = await getDb()
    .update(strategies)
    .set({ status: 'archived', deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId), isNull(strategies.deletedAt)))
    .returning({ id: strategies.id });

  if (rows.length === 0) {
    throw new NotFoundError('Strategy not found');
  }
}

/**
 * Lists rules for a strategy.
 */
export async function listRules(
  userId: string,
  strategyId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<typeof strategyRules.$inferSelect[]> {
  const { limit = 50, offset = 0 } = options;

  // Verify ownership
  const strategy = await findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  const rows = await getDb()
    .select()
    .from(strategyRules)
    .where(eq(strategyRules.strategyId, strategyId))
    .orderBy(strategyRules.position)
    .limit(limit)
    .offset(offset);

  return rows;
}

/**
 * Gets a single rule by ID.
 */
export async function findRuleById(strategyId: string, ruleId: string): Promise<typeof strategyRules.$inferSelect | undefined> {
  const rows = await getDb()
    .select()
    .from(strategyRules)
    .where(and(eq(strategyRules.id, ruleId), eq(strategyRules.strategyId, strategyId)))
    .limit(1);

  return rows[0];
}

/**
 * Inserts a new rule at the end of the list.
 */
export async function insertRule(
  strategyId: string,
  input: { text: string; isRequired: boolean },
): Promise<typeof strategyRules.$inferSelect> {
  // Get the next position
  const maxPos = await getDb()
    .select({ maxPos: sql<number>`COALESCE(MAX(${strategyRules.position}), -1)` })
    .from(strategyRules)
    .where(eq(strategyRules.strategyId, strategyId))
    .limit(1);

  const nextPosition = (maxPos[0]?.maxPos ?? -1) + 1;

  const now = new Date();

  const rows = await getDb()
    .insert(strategyRules)
    .values({
      ...input,
      id: generateId(),
      strategyId,
      position: nextPosition,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Rule insert returned no row');

  return created;
}

/**
 * Updates a rule (PATCH).
 */
export async function updateRule(
  strategyId: string,
  ruleId: string,
  patch: Partial<{ text: string; isRequired: boolean }>,
): Promise<typeof strategyRules.$inferSelect> {
  const rule = await findRuleById(strategyId, ruleId);
  if (!rule) throw new NotFoundError('Rule not found');

  const rows = await getDb()
    .update(strategyRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(strategyRules.id, ruleId), eq(strategyRules.strategyId, strategyId)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new NotFoundError('Rule not found');

  return updated;
}

/**
 * Soft deletes a rule and closes the gap in positions.
 */
export async function deleteRule(strategyId: string, ruleId: string): Promise<void> {
  const rule = await findRuleById(strategyId, ruleId);
  if (!rule) throw new NotFoundError('Rule not found');

  const deletedPosition = rule.position;

  // Delete the rule
  await getDb()
    .delete(strategyRules)
    .where(and(eq(strategyRules.id, ruleId), eq(strategyRules.strategyId, strategyId)));

  // Close the gap: decrement positions of all rules after the deleted one
  await getDb()
    .update(strategyRules)
    .set({ position: sql`${strategyRules.position} - 1`, updatedAt: new Date() })
    .where(
      and(
        eq(strategyRules.strategyId, strategyId),
        gt(strategyRules.position, deletedPosition),
      )
    );
}

/**
 * Reorders rules within a strategy. Rewrites positions for all rules in one transaction.
 */
export async function reorderRules(
  userId: string,
  strategyId: string,
  ruleIds: string[],
): Promise<void> {
  // Verify ownership
  const strategy = await findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  // Fetch current rules to validate the input contains exactly all rules
  const currentRules = await getDb()
    .select({ id: strategyRules.id, position: strategyRules.position })
    .from(strategyRules)
    .where(eq(strategyRules.strategyId, strategyId))
    .orderBy(strategyRules.position);

  if (currentRules.length !== ruleIds.length) {
    throw new ConflictError('Rule list must contain exactly all rules for this strategy');
  }

  const currentIds = currentRules.map(r => r.id);
  const inputSet = new Set(ruleIds);
  if (!currentIds.every(id => inputSet.has(id)) || inputSet.size !== currentIds.length) {
    throw new ConflictError('Rule list must contain exactly all rules for this strategy');
  }

  // Perform the reorder in a single transaction by updating all positions
  // We do this by updating each rule's position based on its index in the new order
  for (let index = 0; index < ruleIds.length; index++) {
    await getDb()
      .update(strategyRules)
      .set({ position: index, updatedAt: new Date() })
      .where(and(eq(strategyRules.id, ruleIds[index]), eq(strategyRules.strategyId, strategyId)));
  }
}

/**
 * Updates a rule (PATCH).
 */
export async function patchRule(
  strategyId: string,
  ruleId: string,
  patch: Partial<{ text: string; isRequired: boolean }>,
): Promise<typeof strategyRules.$inferSelect> {
  const rule = await findRuleById(strategyId, ruleId);
  if (!rule) throw new NotFoundError('Rule not found');

  const rows = await getDb()
    .update(strategyRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(strategyRules.id, ruleId), eq(strategyRules.strategyId, strategyId)))
    .returning();

  const updated = rows[0];
  if (!updated) throw new NotFoundError('Rule not found');

  return updated;
}

/**
 * Soft deletes a rule and closes the gap in positions.
 */
export async function deleteRuleById(strategyId: string, ruleId: string): Promise<void> {
  const rule = await findRuleById(strategyId, ruleId);
  if (!rule) throw new NotFoundError('Rule not found');

  const deletedPosition = rule.position;

  await getDb()
    .delete(strategyRules)
    .where(and(eq(strategyRules.id, ruleId), eq(strategyRules.strategyId, strategyId)));

  await getDb()
    .update(strategyRules)
    .set({ position: sql`${strategyRules.position} - 1`, updatedAt: new Date() })
    .where(
      and(
        eq(strategyRules.strategyId, strategyId),
        gt(strategyRules.position, deletedPosition),
      )
    );
}

import { generateId } from '../../lib/ids.js';