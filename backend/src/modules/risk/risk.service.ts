import { NotFoundError } from '../../lib/errors.js';
import * as repo from './risk.repository.js';
import {
  riskAmount,
  riskPercent as riskPercentFn,
  exactLot,
  recommendedLot,
  actualRisk,
  rrRatio,
  projectedProfit,
  flooringWarning,
} from '../../analytics/formulas.js';
import { getDb } from '../../db/index.js';
import { instrumentSpecs } from '../../db/schema/instrument.js';
import { and, eq, isNull } from 'drizzle-orm';

export interface RiskCalculateInput {
  accountId?: string;
  balance: string;
  riskPercent?: string;
  riskAmount?: string | null;
  direction: 'long' | 'short';
  entryPrice: string;
  stopLoss: string;
  takeProfit?: string;
  broker?: string;
  symbol?: string;
  contractSize?: string;
  lotStep?: string;
  minLot?: string;
  maxLot?: string;
  pipValue?: string | null;
}

export interface RiskCalculateResult {
  slDistance: string;
  riskAmount: string;
  exactLot: string;
  recommendedLot: string;
  roundedLot: string;
  actualRisk: string;
  rrRatio: string;
  potentialProfit: string;
  riskPercentActual: string;
  warnings: string[];
}

export interface RiskPresetResource {
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Resolves instrument specification from database or uses provided overrides.
 * User-owned specs take precedence over global seeds.
 */
async function resolveInstrumentSpec(
  userId: string | undefined,
  broker: string | undefined,
  symbol: string | undefined,
): Promise<{
  contractSize: string;
  lotStep: string;
  minLot: string;
  maxLot: string;
  pipValue: string | null;
  currency: string;
} | null> {
  if (!broker || !symbol) return null;

  const db = getDb();

  // First try user-owned spec
  if (userId) {
    const userSpec = await db
      .select()
      .from(instrumentSpecs)
      .where(
        and(
          eq(instrumentSpecs.broker, broker),
          eq(instrumentSpecs.symbol, symbol.toUpperCase()),
          eq(instrumentSpecs.userId, userId),
        ),
      )
      .limit(1);

    if (userSpec.length > 0) {
      const s = userSpec[0];
      return {
        contractSize: s.contractSize,
        lotStep: s.lotStep,
        minLot: s.minLot,
        maxLot: s.maxLot,
        pipValue: s.pipValue ?? null,
        currency: s.currency,
      };
    }
  }

  // Fall back to global seed spec
  const globalSpec = await db
    .select()
    .from(instrumentSpecs)
    .where(
      and(
        eq(instrumentSpecs.broker, broker),
        eq(instrumentSpecs.symbol, symbol.toUpperCase()),
        isNull(instrumentSpecs.userId),
      ),
    )
    .limit(1);

  if (globalSpec.length > 0) {
    const s = globalSpec[0];
    return {
      contractSize: s.contractSize,
      lotStep: s.lotStep,
      minLot: s.minLot,
      maxLot: s.maxLot,
      pipValue: s.pipValue ?? null,
      currency: s.currency,
    };
  }

  return null;
}

/**
 * Calculates risk metrics for a trade setup.
 * Implements database-schema.md §5.3 formulas.
 */
export async function calculateRisk(
  userId: string | undefined,
  input: RiskCalculateInput,
): Promise<RiskCalculateResult> {
  const {
    balance,
    riskPercent: inputRiskPercent,
    riskAmount: inputRiskAmount,
    entryPrice,
    stopLoss,
    takeProfit,
    broker,
    symbol,
    contractSize: overrideContractSize,
    lotStep: overrideLotStep,
    minLot: overrideMinLot,
    maxLot: overrideMaxLot,
  } = input;

  // Resolve instrument spec
  const spec = await resolveInstrumentSpec(userId, broker, symbol);

  const contractSize = overrideContractSize ?? spec?.contractSize ?? '1';
  const lotStep = overrideLotStep ?? spec?.lotStep ?? '0.01';
  const minLot = overrideMinLot ?? spec?.minLot ?? '0.01';
  const maxLot = overrideMaxLot ?? spec?.maxLot ?? '100';

  // Calculate stop loss distance
  const entry = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);
  const slDistance = Math.abs(entry - sl).toFixed(10);

  // Calculate risk amount
  let riskAmt: string;
  if (inputRiskAmount !== undefined && inputRiskAmount !== null) {
    riskAmt = inputRiskAmount;
  } else if (inputRiskPercent) {
    riskAmt = riskAmount(balance, inputRiskPercent);
  } else {
    throw new Error('Either riskPercent or riskAmount must be provided');
  }

  // Calculate exact lot
  const exactLotValue = exactLot(riskAmt, slDistance, contractSize);

  // Floor to lot step and clamp
  const recommendedLotValue = recommendedLot(exactLotValue, lotStep, minLot, maxLot);

  // Calculate actual risk with recommended lot
  const actualRiskValue = actualRisk(slDistance, recommendedLotValue, contractSize);

  // Risk percent actual
  const riskPercentActual = riskPercentFn(actualRiskValue, balance);

  // Risk/reward ratio
  let rrRatioValue = '0';
  let potentialProfitValue = '0';
  const warnings: string[] = [];

  if (takeProfit) {
    rrRatioValue = rrRatio(entryPrice, takeProfit, stopLoss);
    potentialProfitValue = projectedProfit(rrRatioValue, actualRiskValue);
  }

  // Check for flooring warning (>5% deviation)
  if (flooringWarning(actualRiskValue, riskAmt)) {
    warnings.push(
      `Flooring to lot step reduced actual risk by more than 5% (requested: ${riskAmt}, actual: ${actualRiskValue})`,
    );
  }

  // Check for clamping warnings
  const exact = parseFloat(exactLotValue);
  const recommended = parseFloat(recommendedLotValue);
  const min = parseFloat(minLot);
  const max = parseFloat(maxLot);

  if (exact < min) {
    warnings.push(`Calculated lot ${exactLotValue} is below minimum ${minLot}, clamped to minimum`);
  } else if (exact > max) {
    warnings.push(`Calculated lot ${exactLotValue} exceeds maximum ${maxLot}, clamped to maximum`);
  } else if (recommended !== exact) {
    warnings.push(`Lot floored from ${exactLotValue} to ${recommendedLotValue} due to lot step ${lotStep}`);
  }

  // Audit if accountId provided
  if (input.accountId) {
    await repo.auditRiskCalculation(userId!, input.accountId, input as unknown as Record<string, unknown>, {
      slDistance,
      riskAmount: riskAmt,
      exactLot: exactLotValue,
      recommendedLot: recommendedLotValue,
      actualRisk: actualRiskValue,
      rrRatio: rrRatioValue,
      potentialProfit: potentialProfitValue,
      warnings,
    });
  }

  return {
    slDistance,
    riskAmount: riskAmt,
    exactLot: exactLotValue,
    recommendedLot: recommendedLotValue,
    roundedLot: parseFloat(recommendedLotValue).toFixed(2),
    actualRisk: actualRiskValue,
    rrRatio: rrRatioValue,
    potentialProfit: potentialProfitValue,
    riskPercentActual,
    warnings,
  };
}

/**
 * Lists user's risk presets.
 */
export async function listPresets(userId: string): Promise<RiskPresetResource[]> {
  const rows = await repo.listPresets(userId);
  return rows.map(toPresetResource);
}

/**
 * Creates a risk preset.
 */
export async function createPreset(userId: string, input: repo.RiskPresetInsert): Promise<RiskPresetResource> {
  const row = await repo.insertPreset(userId, input);
  return toPresetResource(row);
}

/**
 * Gets a risk preset by ID.
 */
export async function getPreset(userId: string, id: string): Promise<RiskPresetResource> {
  const row = await repo.findPresetById(userId, id);
  if (!row) throw new NotFoundError('Risk preset not found');
  return toPresetResource(row);
}

/**
 * Updates a risk preset.
 */
export async function updatePreset(userId: string, id: string, patch: repo.RiskPresetPatch): Promise<RiskPresetResource> {
  const row = await repo.updatePreset(userId, id, patch);
  if (!row) throw new NotFoundError('Risk preset not found');
  return toPresetResource(row);
}

/**
 * Deletes a risk preset.
 */
export async function deletePreset(userId: string, id: string): Promise<void> {
  await repo.deletePreset(userId, id);
}

function toPresetResource(row: repo.RiskPresetRow): RiskPresetResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    accountId: row.accountId,
    balance: row.balance,
    riskPercent: row.riskPercent,
    riskAmount: row.riskAmount,
    direction: row.direction,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    broker: row.broker,
    symbol: row.symbol,
    contractSize: row.contractSize,
    lotStep: row.lotStep,
    minLot: row.minLot,
    maxLot: row.maxLot,
    pipValue: row.pipValue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}