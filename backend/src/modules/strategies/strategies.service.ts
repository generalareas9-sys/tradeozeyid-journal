import { generateId } from '../../lib/ids.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { writeAudit } from '../audit/audit.service.js';
import * as repo from './strategies.repository.js';
import { strategies, strategyRules, trades } from '../../db/schema/trading.js';
import { eq, isNull, and } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { pnl as computePnl, plannedRisk as computePlannedRisk, priceDelta, grossPnl, rMultiple as computeRMultiple } from '../../analytics/formulas.js';
import type { Request } from 'express';

/**
 * Strategies business logic (engineering-contract.md §5, api-spec.md §9.5).
 *
 * All data access goes through the repository. The service enforces
 * the rules that span multiple operations: name uniqueness, rule ordering,
 * gapless reorder, cascade delete of rules on archive.
 */

export interface StrategyResource {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: 'active' | 'archived';
  color: string | null;
  rules: Array<{
    id: string;
    position: number;
    text: string;
    isRequired: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  tradeCount: number;
  stats: {
    netPnl: string | null;
    winRate: number | null;
    profitFactor: string | null;
    averageR: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StrategyRuleResource {
  id: string;
  position: number;
  text: string;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

function toResource(row: any & { rules: any[]; tradeCount: number }): any {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    color: row.color,
    rules: row.rules.map((r: any) => ({
      id: r.id,
      position: r.position,
      text: r.text,
      isRequired: r.isRequired,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    tradeCount: row.tradeCount,
    stats: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function ruleToResource(rule: any): any {
  return {
    id: rule.id,
    position: rule.position,
    text: rule.text,
    isRequired: rule.isRequired,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function clientMeta(req: Request): { userAgent: string | null; ip: string | null } {
  const ua = req.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua : null,
    ip: typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null,
  };
}

/**
 * Validates SL/TP side checks per schema constraints.
 */
function validateSideChecks(
  direction: 'long' | 'short',
  entryPrice: string,
  stopLoss: string,
  takeProfit: string | null | undefined,
): void {
  const entry = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);

  if (direction === 'long') {
    if (sl >= entry) {
      throw new ValidationError([{ path: 'stopLoss', message: 'Stop loss must be below entry price for long trades' }]);
    }
  } else {
    if (sl <= entry) {
      throw new ValidationError([{ path: 'stopLoss', message: 'Stop loss must be above entry price for short trades' }]);
    }
  }

  if (takeProfit !== null && takeProfit !== undefined) {
    const tp = parseFloat(takeProfit);
    if (direction === 'long' && tp <= entry) {
      throw new ValidationError([{ path: 'takeProfit', message: 'Take profit must be above entry price for long trades' }]);
    }
    if (direction === 'short' && tp >= entry) {
      throw new ValidationError([{ path: 'takeProfit', message: 'Take profit must be below entry price for short trades' }]);
    }
  }
}

/**
 * Validates contractSize per account type rules.
 * For live accounts, contractSize must match the instrument spec exactly.
 * For demo/prop, an explicit contractSize is accepted.
 */
async function validateContractSize(
  accountType: 'live' | 'demo' | 'prop',
  providedContractSize: string | undefined,
  specContractSize: string,
): Promise<string> {
  if (accountType === 'live') {
    if (providedContractSize !== undefined) {
      throw new ValidationError([{ path: 'contractSize', message: 'Contract size is determined by the instrument spec for live accounts' }]);
    }
    return specContractSize;
  }

  return providedContractSize ?? specContractSize;
}

/**
 * Lists the user's strategies with optional filters.
 */
export async function listStrategies(
  userId: string,
  options: { status?: 'active' | 'archived'; q?: string; limit?: number; offset?: number; sort?: string; order?: 'asc' | 'desc' } = {}
) {
  const rows = await repo.listStrategies(userId, options);
  return rows.map(toResource);
}

/**
 * Gets a single strategy by ID with its rules.
 */
export async function getStrategy(userId: string, id: string) {
  const result = await repo.getStrategyWithRules(userId, id);
  if (!result) throw new NotFoundError('Strategy not found');
  return toResource({ ...result.strategy, rules: result.rules, tradeCount: result.tradeCount });
}

/**
 * Creates a new strategy.
 */
export async function createStrategy(
  userId: string,
  input: {
    name: string;
    description: string | null;
    category: string | null;
    color: string | null;
    status: 'active' | 'archived';
  },
  req: Request,
) {
  // Duplicate name check (case-insensitive)
  if (await repo.nameExists(userId, input.name)) {
    throw new ConflictError('A strategy with that name already exists');
  }

  const row = await repo.insertStrategy(userId, input);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.create',
    entityType: 'strategy',
    entityId: row.id,
    req,
  });

  return { id: row.id };
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
  }>,
  req: Request,
) {
  const row = await repo.updateStrategy(userId, id, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.update',
    entityType: 'strategy',
    entityId: id,
    req,
  });

  return toResource({ ...row, rules: [], tradeCount: 0 });
}

/**
 * Archives a strategy (soft delete).
 * Rules are cascade-deleted by the database.
 */
export async function archiveStrategy(userId: string, id: string, req: Request): Promise<void> {
  await repo.archiveStrategy(userId, id);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.archive',
    entityType: 'strategy',
    entityId: id,
    req,
  });
}

/**
 * Lists rules for a strategy.
 */
export async function listRules(userId: string, strategyId: string, options: { limit?: number; offset?: number } = {}) {
  const rules = await repo.listRules(userId, strategyId, options);
  return rules.map(ruleToResource);
}

/**
 * Creates a rule at the end of the list.
 */
export async function createRule(
  userId: string,
  strategyId: string,
  input: { text: string; isRequired: boolean },
  req: Request,
) {
  // Verify ownership
  const strategy = await repo.findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  const rule = await repo.insertRule(strategyId, input);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.rule.create',
    entityType: 'strategy_rule',
    entityId: rule.id,
    req,
  });

  return ruleToResource(rule);
}

/**
 * Updates a rule (PATCH).
 */
export async function updateRule(
  userId: string,
  strategyId: string,
  ruleId: string,
  patch: Partial<{ text: string; isRequired: boolean }>,
  req: Request,
) {
  // Verify ownership
  const strategy = await repo.findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  const rule = await repo.patchRule(strategyId, ruleId, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.rule.update',
    entityType: 'strategy_rule',
    entityId: ruleId,
    req,
  });

  return ruleToResource(rule);
}

/**
 * Reorders rules within a strategy (gapless, transactional).
 */
export async function reorderRules(userId: string, strategyId: string, ruleIds: string[], req: Request): Promise<void> {
  // Verify ownership
  const strategy = await repo.findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  await repo.reorderRules(userId, strategyId, ruleIds);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.rules.reorder',
    entityType: 'strategy',
    entityId: strategyId,
    req,
    metadata: { ruleIds },
  });
}

/**
 * Updates a rule (PATCH).
 */
export async function patchRule(
  userId: string,
  strategyId: string,
  ruleId: string,
  patch: Partial<{ text: string; isRequired: boolean }>,
  req: Request,
) {
  // Verify ownership
  const strategy = await repo.findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  const rule = await repo.patchRule(strategyId, ruleId, patch);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.rule.update',
    entityType: 'strategy_rule',
    entityId: ruleId,
    req,
  });

  return ruleToResource(await repo.findRuleById(strategyId, ruleId));
}

/**
 * Deletes a rule and closes the gap.
 */
export async function deleteRule(userId: string, strategyId: string, ruleId: string, req: Request): Promise<void> {
  // Verify ownership
  const strategy = await repo.findStrategyById(userId, strategyId);
  if (!strategy) throw new NotFoundError('Strategy not found');

  await repo.deleteRule(strategyId, ruleId);

  await writeAudit({
    actorUserId: userId,
    action: 'strategy.rule.delete',
    entityType: 'strategy_rule',
    entityId: ruleId,
    req,
  });
}

/**
 * Archives a strategy.
 */