import { and, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { trades, tradingAccounts } from '../../db/schema/trading.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { generateId } from '../../lib/ids.js';

/**
 * Trading accounts data access (engineering-contract.md §5.5, §7.14).
 *
 * Every query resolves on `user_id`. `deleted_at` filtering is applied
 * automatically so soft-deleted rows are never returned unless explicitly
 * requested.
 */

export type TradingAccountRow = typeof tradingAccounts.$inferSelect;

export interface TradingAccountWithComputed extends TradingAccountRow {
  currentBalance: string;
  tradeCount: number;
}

function toComputed(row: TradingAccountRow & { currentBalance?: string; tradeCount?: number }): TradingAccountWithComputed {
  return {
    ...row,
    currentBalance: row.currentBalance ?? row.startingBalance,
    tradeCount: row.tradeCount ?? 0,
  };
}

/**
 * Lists the user's trading accounts, ordered by created_at desc.
 */
export async function listAccounts(
  userId: string,
  options: { includeArchived?: boolean; status?: 'active' | 'archived' } = {}
): Promise<TradingAccountWithComputed[]> {
  const { includeArchived = false, status } = options;

  const conditions = [eq(tradingAccounts.userId, userId)];

  if (!includeArchived) {
    conditions.push(isNull(tradingAccounts.deletedAt));
  }

  if (status) {
    conditions.push(eq(tradingAccounts.status, status));
  }

  // Subquery for closed trades PnL sum per account
  const pnlSubquery = getDb()
    .select({
      accountId: trades.accountId,
      sumPnl: sql<string>`COALESCE(SUM(${trades.pnl}), '0')`.as('sum_pnl'),
    })
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
        eq(trades.status, 'closed'),
      )
    )
    .groupBy(trades.accountId)
    .as('pnl_sum');

  // Subquery for trade count per account
  const countSubquery = getDb()
    .select({
      accountId: trades.accountId,
      cnt: count(trades.id).as('trade_count'),
    })
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
      )
    )
    .groupBy(trades.accountId)
    .as('trade_cnt');

  const rows = await getDb()
    .select({
      account: tradingAccounts,
      sumPnl: pnlSubquery.sumPnl,
      tradeCount: countSubquery.cnt,
    })
    .from(tradingAccounts)
    .leftJoin(pnlSubquery, eq(tradingAccounts.id, pnlSubquery.accountId))
    .leftJoin(countSubquery, eq(tradingAccounts.id, countSubquery.accountId))
    .where(and(...conditions))
    .orderBy(desc(tradingAccounts.createdAt));

  return rows.map((row) => {
    const pnl = row.sumPnl ?? '0';
    const starting = row.account.startingBalance;
    const current = (parseFloat(starting) + parseFloat(pnl)).toFixed(10);
    return toComputed({
      ...row.account,
      currentBalance: current,
      tradeCount: Number(row.tradeCount ?? 0),
    });
  });
}

/**
 * Finds a single account by ID, scoped to the user.
 */
export async function findAccountById(
  userId: string,
  id: string,
  options: { includeArchived?: boolean } = {}
): Promise<TradingAccountWithComputed | undefined> {
  const { includeArchived = false } = options;

  const conditions = [
    eq(tradingAccounts.id, id),
    eq(tradingAccounts.userId, userId),
  ];

  if (!includeArchived) {
    conditions.push(isNull(tradingAccounts.deletedAt));
  }

  const rows = await getDb()
    .select()
    .from(tradingAccounts)
    .where(and(...conditions))
    .limit(1);

  if (!rows[0]) return undefined;

  // Compute current balance
  const pnlResult = await getDb()
    .select({ sumPnl: sql<string>`COALESCE(SUM(${trades.pnl}), '0')`.as('sum_pnl') })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, id),
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
        eq(trades.status, 'closed'),
      )
    );

  const pnl = pnlResult[0]?.sumPnl ?? '0';
  const starting = rows[0].startingBalance;
  const current = (parseFloat(starting) + parseFloat(pnl)).toFixed(10);

  const tradeCountResult = await getDb()
    .select({ cnt: count(trades.id).as('trade_count') })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, id),
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
      )
    );

  return toComputed({
    ...rows[0],
    currentBalance: current,
    tradeCount: Number(tradeCountResult[0]?.cnt ?? 0),
  });
}

/**
 * Checks if a name already exists for this user (case-insensitive, among non-deleted).
 */
export async function nameExists(userId: string, name: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: tradingAccounts.id })
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.userId, userId),
        eq(sql`lower(${tradingAccounts.name})`, name.toLowerCase()),
        isNull(tradingAccounts.deletedAt),
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Checks if the user already has a default account.
 */
export async function hasDefaultAccount(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: tradingAccounts.id })
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.userId, userId),
        eq(tradingAccounts.isDefault, true),
        isNull(tradingAccounts.deletedAt),
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Inserts a new trading account.
 */
export async function insertAccount(
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
): Promise<TradingAccountWithComputed> {
  const now = new Date();
  const id = generateId();

  const rows = await getDb()
    .insert(tradingAccounts)
    .values({
      ...input,
      id,
      userId,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof tradingAccounts.$inferInsert)
    .returning();

  const created = rows[0];
  if (!created) throw new Error('Account insert returned no row');

  // If this is the first account, make it default regardless of input
  if (input.isDefault) {
    await getDb()
      .update(tradingAccounts)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(tradingAccounts.userId, userId),
          ne(tradingAccounts.id, created.id),
          isNull(tradingAccounts.deletedAt),
        )
      );
  }

  return toComputed({ ...created, currentBalance: created.startingBalance, tradeCount: 0 });
}

/**
 * Updates an account (PATCH).
 *
 * Changing `startingBalance` is rejected if the account has any closed trades,
 * because `currentBalance` and equity curves depend on it.
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
): Promise<TradingAccountWithComputed> {
  // If setting a new default, clear the existing one
  if (patch.isDefault === true) {
    await getDb()
      .update(tradingAccounts)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(tradingAccounts.userId, userId),
          eq(tradingAccounts.isDefault, true),
          isNull(tradingAccounts.deletedAt),
        )
      );
  }

  // If changing startingBalance, check for closed trades
  if (patch.startingBalance !== undefined) {
    const closedExists = await getDb()
      .select({ id: trades.id })
      .from(trades)
      .where(
        and(
          eq(trades.accountId, id),
          eq(trades.userId, userId),
          isNull(trades.deletedAt),
          eq(trades.status, 'closed'),
        )
      )
      .limit(1);

    if (closedExists.length > 0) {
      throw new ConflictError('Cannot change starting balance: account has closed trades');
    }
  }

  // If changing name, check for duplicate (case-insensitive among non-deleted)
  if (patch.name !== undefined) {
    const duplicate = await getDb()
      .select({ id: tradingAccounts.id })
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.userId, userId),
          eq(sql`lower(${tradingAccounts.name})`, patch.name.toLowerCase()),
          isNull(tradingAccounts.deletedAt),
          ne(tradingAccounts.id, id),
        )
      )
      .limit(1);

    if (duplicate.length > 0) {
      throw new ConflictError('An account with that name already exists');
    }
  }

  const rows = await getDb()
    .update(tradingAccounts)
    .set({
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
      updatedAt: new Date(),
    } as typeof tradingAccounts.$inferInsert)
    .where(
      and(
        eq(tradingAccounts.id, id),
        eq(tradingAccounts.userId, userId),
        isNull(tradingAccounts.deletedAt),
      )
    )
    .returning();

  const updated = rows[0];
  if (!updated) {
    throw new NotFoundError('Trading account not found');
  }

  return findAccountById(userId, id) as Promise<TradingAccountWithComputed>;
}

/**
 * Archives an account (soft delete by setting deleted_at and status=archived).
 *
 * Rejected if the account has closed trades.
 */
export async function archiveAccount(userId: string, id: string): Promise<void> {
  const closedExists = await getDb()
    .select({ id: trades.id })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, id),
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
        eq(trades.status, 'closed'),
      )
    )
    .limit(1);

  if (closedExists.length > 0) {
    throw new ConflictError('Cannot archive: account has closed trades');
  }

  const rows = await getDb()
    .update(tradingAccounts)
    .set({
      status: 'archived',
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradingAccounts.id, id),
        eq(tradingAccounts.userId, userId),
        isNull(tradingAccounts.deletedAt),
      )
    )
    .returning({ id: tradingAccounts.id });

  if (rows.length === 0) {
    throw new NotFoundError('Trading account not found');
  }
}

/**
 * Sets an account as the default for the user.
 */
export async function setDefaultAccount(userId: string, id: string): Promise<void> {
  // Verify ownership and that it's not archived
  const account = await findAccountById(userId, id);
  if (!account) {
    throw new NotFoundError('Trading account not found');
  }

  if (account.status === 'archived') {
    throw new ConflictError('Cannot set an archived account as default');
  }

  const now = new Date();

  // Clear existing default
  await getDb()
    .update(tradingAccounts)
    .set({ isDefault: false, updatedAt: now })
    .where(
      and(
        eq(tradingAccounts.userId, userId),
        eq(tradingAccounts.isDefault, true),
        isNull(tradingAccounts.deletedAt),
      )
    );

  // Set new default
  await getDb()
    .update(tradingAccounts)
    .set({ isDefault: true, updatedAt: now })
    .where(
      and(
        eq(tradingAccounts.id, id),
        eq(tradingAccounts.userId, userId),
        isNull(tradingAccounts.deletedAt),
      )
    );
}

/**
 * Gets the user's default account (active, not deleted).
 */
export async function getDefaultAccount(userId: string): Promise<TradingAccountWithComputed | undefined> {
  const rows = await getDb()
    .select()
    .from(tradingAccounts)
    .where(
      and(
        eq(tradingAccounts.userId, userId),
        eq(tradingAccounts.isDefault, true),
        isNull(tradingAccounts.deletedAt),
      )
    )
    .limit(1);

  if (!rows[0]) return undefined;

  return findAccountById(userId, rows[0].id);
}

/**
 * Checks if an account has closed trades (for validation).
 */
export async function hasClosedTrades(userId: string, accountId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: trades.id })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
        eq(trades.status, 'closed'),
      )
    )
    .limit(1);

  return rows.length > 0;
}