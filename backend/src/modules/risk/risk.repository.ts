import { getDb } from '../../db/index.js';
import { sql } from 'drizzle-orm';

export interface RiskPresetRow {
  id: string;
  userId: string;
  name: string;
  accountId: string | null;
  balance: string | null;
  riskPercent: string | null;
  riskAmount: string | null;
  direction: 'long' | 'short' | null;
  entryPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  broker: string | null;
  symbol: string | null;
  contractSize: string | null;
  lotStep: string | null;
  minLot: string | null;
  maxLot: string | null;
  pipValue: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskPresetInsert {
  name: string;
  accountId?: string | null;
  balance?: string | null;
  riskPercent?: string | null;
  riskAmount?: string | null;
  direction?: 'long' | 'short' | null;
  entryPrice?: string | null;
  stopLoss?: string | null;
  takeProfit?: string | null;
  broker?: string | null;
  symbol?: string | null;
  contractSize?: string | null;
  lotStep?: string | null;
  minLot?: string | null;
  maxLot?: string | null;
  pipValue?: string | null;
}

export interface RiskPresetPatch {
  name?: string;
  accountId?: string | null;
  balance?: string | null;
  riskPercent?: string | null;
  riskAmount?: string | null;
  direction?: 'long' | 'short' | null;
  entryPrice?: string | null;
  stopLoss?: string | null;
  takeProfit?: string | null;
  broker?: string | null;
  symbol?: string | null;
  contractSize?: string | null;
  lotStep?: string | null;
  minLot?: string | null;
  maxLot?: string | null;
  pipValue?: string | null;
}

export interface RiskCalculationAuditRow {
  id: string;
  userId: string;
  accountId: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Lists the user's risk presets.
 */
export async function listPresets(userId: string): Promise<RiskPresetRow[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT id, user_id as "userId", name, account_id as "accountId",
           balance, risk_percent as "riskPercent", risk_amount as "riskAmount",
           direction, entry_price as "entryPrice", stop_loss as "stopLoss",
           take_profit as "takeProfit", broker, symbol, contract_size as "contractSize",
           lot_step as "lotStep", min_lot as "minLot", max_lot as "maxLot",
           pip_value as "pipValue", created_at as "createdAt", updated_at as "updatedAt"
    FROM risk_presets
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `);
  return rows as unknown as RiskPresetRow[];
}

/**
 * Inserts a new risk preset.
 */
export async function insertPreset(userId: string, input: RiskPresetInsert): Promise<RiskPresetRow> {
  const db = getDb();
  const id = sql`gen_random_uuid()`;
  const now = sql`now()`;

  const rows = await db.execute(sql`
    INSERT INTO risk_presets (
      id, user_id, name, account_id, balance, risk_percent, risk_amount,
      direction, entry_price, stop_loss, take_profit, broker, symbol,
      contract_size, lot_step, min_lot, max_lot, pip_value,
      created_at, updated_at
    ) VALUES (
      ${id}, ${userId}, ${input.name}, ${input.accountId ?? null},
      ${input.balance ?? null}, ${input.riskPercent ?? null}, ${input.riskAmount ?? null},
      ${input.direction ?? null}, ${input.entryPrice ?? null}, ${input.stopLoss ?? null},
      ${input.takeProfit ?? null}, ${input.broker ?? null}, ${input.symbol ?? null},
      ${input.contractSize ?? null}, ${input.lotStep ?? null}, ${input.minLot ?? null},
      ${input.maxLot ?? null}, ${input.pipValue ?? null}, ${now}, ${now}
    )
    RETURNING id, user_id as "userId", name, account_id as "accountId",
              balance, risk_percent as "riskPercent", risk_amount as "riskAmount",
              direction, entry_price as "entryPrice", stop_loss as "stopLoss",
              take_profit as "takeProfit", broker, symbol, contract_size as "contractSize",
              lot_step as "lotStep", min_lot as "minLot", max_lot as "maxLot",
              pip_value as "pipValue", created_at as "createdAt", updated_at as "updatedAt"
  `);
  return rows[0] as unknown as RiskPresetRow;
}

/**
 * Finds a risk preset by ID.
 */
export async function findPresetById(userId: string, id: string): Promise<RiskPresetRow | undefined> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT id, user_id as "userId", name, account_id as "accountId",
           balance, risk_percent as "riskPercent", risk_amount as "riskAmount",
           direction, entry_price as "entryPrice", stop_loss as "stopLoss",
           take_profit as "takeProfit", broker, symbol, contract_size as "contractSize",
           lot_step as "lotStep", min_lot as "minLot", max_lot as "maxLot",
           pip_value as "pipValue", created_at as "createdAt", updated_at as "updatedAt"
    FROM risk_presets
    WHERE user_id = ${userId} AND id = ${id}
    LIMIT 1
  `);
  return rows[0] as unknown as RiskPresetRow | undefined;
}

/**
 * Updates a risk preset.
 */
export async function updatePreset(userId: string, id: string, patch: RiskPresetPatch): Promise<RiskPresetRow | undefined> {
  const db = getDb();
  const now = sql`now()`;

  // Build dynamic update using sql fragments
  const fragments = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fragments.push(sql`${sql.raw(col)} = ${value}`);
    }
  }

  if (fragments.length === 0) return findPresetById(userId, id);

  fragments.push(sql`updated_at = ${now}`);

  const query = sql`
    UPDATE risk_presets
    SET ${sql.join(fragments, sql`, `)}
    WHERE user_id = ${userId} AND id = ${id}
    RETURNING id, user_id as "userId", name, account_id as "accountId",
              balance, risk_percent as "riskPercent", risk_amount as "riskAmount",
              direction, entry_price as "entryPrice", stop_loss as "stopLoss",
              take_profit as "takeProfit", broker, symbol, contract_size as "contractSize",
              lot_step as "lotStep", min_lot as "minLot", max_lot as "maxLot",
              pip_value as "pipValue", created_at as "createdAt", updated_at as "updatedAt"
  `;

  const rows = await db.execute(query);
  return rows[0] as unknown as RiskPresetRow | undefined;
}

/**
 * Deletes a risk preset.
 */
export async function deletePreset(userId: string, id: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    DELETE FROM risk_presets
    WHERE user_id = ${userId} AND id = ${id}
  `);
}

/**
 * Audits a risk calculation.
 */
export async function auditRiskCalculation(
  userId: string,
  accountId: string,
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO risk_calculation_audit (id, user_id, account_id, input, result, created_at)
    VALUES (gen_random_uuid(), ${userId}, ${accountId}, ${JSON.stringify(input)}, ${JSON.stringify(result)}, now())
  `);
}