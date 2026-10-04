import { generateId } from '../../lib/ids.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import * as repo from './trading-accounts.repository.js';

/**
 * Trading accounts business logic (engineering-contract.md §5).
 *
 * All data access goes through the repository. The service enforces
 * the rules that span multiple operations: default uniqueness, starting
 * balance immutability once trades exist, archive restrictions.
 */

export interface TradingAccountResource {
  id: string;
  name: string;
  broker: string | null;
  type: 'live' | 'demo' | 'prop';
  status: 'active' | 'archived';
  currency: string;
  startingBalance: string;
  currentBalance: string;
  timezone: string | null;
  defaultRiskPercent: number;
  isDefault: boolean;
  notes: string | null;
  tradeCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toResource(row: repo.TradingAccountWithComputed): TradingAccountResource {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    type: row.type,
    status: row.status,
    currency: row.currency,
    startingBalance: row.startingBalance,
    currentBalance: row.currentBalance,
    timezone: row.timezone,
    defaultRiskPercent: Number(row.defaultRiskPercent),
    isDefault: row.isDefault,
    notes: row.notes,
    tradeCount: row.tradeCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Lists the user's trading accounts with optional archived filter.
 */
export async function listAccounts(
  userId: string,
  options: { includeArchived?: boolean; status?: 'active' | 'archived' } = {}
): Promise<TradingAccountResource[]> {
  const rows = await repo.listAccounts(userId, options);
  return rows.map(toResource);
}

/**
 * Gets a single account by ID.
 */
export async function getAccount(
  userId: string,
  id: string,
  options: { includeArchived?: boolean } = {}
): Promise<TradingAccountResource> {
  const row = await repo.findAccountById(userId, id, options);
  if (!row) throw new NotFoundError('Trading account not found');
  return toResource(row);
}

/**
 * Creates a new trading account.
 *
 * The first account a user creates automatically becomes the default.
 * Duplicate name (case-insensitive) returns CONFLICT.
 */
export async function createAccount(
  userId: string,
  input: {
    name: string;
    broker: string | null;
    type: 'live' | 'demo' | 'prop';
    currency: string;
    startingBalance: string;
    timezone: string | null;
    defaultRiskPercent: number;
    isDefault: boolean;
    notes: string | null;
  }
): Promise<TradingAccountResource> {
  // If this is the user's first account, force isDefault=true
  const hasDefault = await repo.hasDefaultAccount(userId);
  if (!hasDefault) {
    input.isDefault = true;
  }

  // Duplicate name check (case-insensitive)
  if (await repo.nameExists(userId, input.name)) {
    throw new ConflictError('An account with that name already exists');
  }

  const row = await repo.insertAccount(userId, input);
  return toResource(row);
}

/**
 * Updates an account (PATCH).
 *
 * Changing `startingBalance` is rejected if the account has closed trades.
 */
export async function updateAccount(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    broker: string | null;
    type: 'live' | 'demo' | 'prop';
    currency: string;
    startingBalance: string;
    timezone: string | null;
    defaultRiskPercent: number;
    isDefault: boolean;
    notes: string | null;
  }>
): Promise<TradingAccountResource> {
  const row = await repo.updateAccount(userId, id, patch);
  return toResource(row);
}

/**
 * Archives an account (soft delete).
 *
 * Rejected if the account has closed trades.
 */
export async function archiveAccount(userId: string, id: string): Promise<void> {
  await repo.archiveAccount(userId, id);
}

/**
 * Sets an account as the default.
 */
export async function setDefaultAccount(userId: string, id: string): Promise<void> {
  await repo.setDefaultAccount(userId, id);
}

/**
 * Gets the user's default account.
 */
export async function getDefaultAccount(userId: string): Promise<TradingAccountResource | undefined> {
  const row = await repo.getDefaultAccount(userId);
  return row ? toResource(row) : undefined;
}