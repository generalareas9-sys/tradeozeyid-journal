/**
 * Canonical money and risk formulas (database-schema.md §5).
 *
 * Single source of truth for all P&L, R-multiple and risk calculations.
 * All money values are decimal strings; rounding happens at the boundary.
 * No currency conversion ever occurs — every trade is in its account's currency.
 */

import { formatMoney } from '../lib/money.js';

export type TradeDirection = 'long' | 'short';

/**
 * Computes price delta for a trade direction.
 *
 * @param entryPrice - Entry price
 * @param exitPrice - Exit price
 * @param direction - Trade direction
 * @returns Price delta (positive means favorable)
 */
export function priceDelta(
  entryPrice: string,
  exitPrice: string,
  direction: TradeDirection,
): string {
  const entry = parseFloat(entryPrice);
  const exit = parseFloat(exitPrice);

  return direction === 'long'
    ? (exit - entry).toFixed(10)
    : (entry - exit).toFixed(10);
}

/**
 * Computes gross P&L before fees and swap.
 *
 * @param priceDelta - Output of priceDelta()
 * @param quantity - Trade quantity in lots
 * @param contractSize - Contract size (units per lot)
 * @returns Gross P&L (before fees/swap)
 */
export function grossPnl(
  priceDelta: string,
  quantity: string,
  contractSize: string,
): string {
  const delta = parseFloat(priceDelta);
  const qty = parseFloat(quantity);
  const size = parseFloat(contractSize);

  return (delta * qty * size).toFixed(10);
}

/**
 * Computes final P&L including fees and swap.
 *
 * @param grossPnl - Output of grossPnl()
 * @param fees - Commission and per-trade charges (non-negative, always subtracted)
 * @param swap - Overnight financing (signed: negative is cost, positive is credit)
 * @returns Final P&L rounded to 10 decimal places
 */
export function pnl(
  grossPnl: string,
  fees: string,
  swap: string,
): string {
  const gross = parseFloat(grossPnl);
  const fee = parseFloat(fees);
  const swp = parseFloat(swap);

  return formatMoney((gross - fee + swp).toFixed(10));
}

/**
 * Computes planned risk at entry.
 *
 * @param entryPrice - Entry price
 * @param stopLoss - Stop loss price
 * @param quantity - Quantity in lots
 * @param contractSize - Contract size
 * @returns Planned risk rounded to 10 decimal places
 */
export function plannedRisk(
  entryPrice: string,
  stopLoss: string,
  quantity: string,
  contractSize: string,
): string {
  const entry = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);
  const qty = parseFloat(quantity);
  const size = parseFloat(contractSize);

  const slDistance = Math.abs(entry - sl);
  return formatMoney((slDistance * qty * size).toFixed(10));
}

/**
 * Computes R-multiple from P&L and planned risk.
 *
 * @param pnlValue - P&L (output of pnl())
 * @param plannedRiskValue - Planned risk (output of plannedRisk())
 * @returns R-multiple rounded to 4 decimal places
 */
export function rMultiple(
  pnlValue: string,
  plannedRiskValue: string,
): string {
  const pnlNum = parseFloat(pnlValue);
  const risk = parseFloat(plannedRiskValue);

  if (risk === 0) return '0';

  return (pnlNum / risk).toFixed(4);
}

/**
 * Computes risk amount from account balance and risk percent.
 *
 * @param accountBalance - Account starting balance
 * @param riskPercent - Risk percentage (e.g., 1.25 for 1.25%)
 * @returns Risk amount rounded to 10 decimal places
 */
export function riskAmount(
  accountBalance: string,
  riskPercent: string,
): string {
  const balance = parseFloat(accountBalance);
  const riskPct = parseFloat(riskPercent);

  return formatMoney((balance * (riskPct / 100)).toFixed(10));
}

/**
 * Computes risk percent from risk amount and account balance.
 *
 * @param riskAmount - Risk amount in currency
 * @param accountBalance - Account starting balance
 * @returns Risk percent rounded to 3 decimal places
 */
export function riskPercent(
  riskAmount: string,
  accountBalance: string,
): string {
  const risk = parseFloat(riskAmount);
  const balance = parseFloat(accountBalance);

  if (balance === 0) return '0.000';

  return ((risk / balance) * 100).toFixed(3);
}

/**
 * Computes exact lot size for a given risk amount.
 *
 * @param riskAmount - Currency amount to risk
 * @param slDistance - Stop loss distance in price units
 * @param contractSize - Contract size
 * @returns Exact lot size (not floored)
 */
export function exactLot(
  riskAmount: string,
  slDistance: string,
  contractSize: string,
): string {
  const risk = parseFloat(riskAmount);
  const slDist = parseFloat(slDistance);
  const size = parseFloat(contractSize);

  if (slDist * size === 0) return '0.0000000000';

  return (risk / (slDist * size)).toFixed(10);
}

/**
 * Floors exact lot to lot step and clamps to min/max.
 *
 * @param exactLotValue - Output of exactLot()
 * @param lotStep - Lot step from instrument specs
 * @param minLot - Minimum lot from instrument specs
 * @param maxLot - Maximum lot from instrument specs
 * @returns Recommended lot size
 */
export function recommendedLot(
  exactLotValue: string,
  lotStep: string,
  minLot: string,
  maxLot: string,
): string {
  const exact = parseFloat(exactLotValue);
  const step = parseFloat(lotStep);
  const min = parseFloat(minLot);
  const max = parseFloat(maxLot);

  const floored = Math.floor(exact / step) * step;
  const clamped = Math.max(min, Math.min(max, floored));

  return clamped.toFixed(2);
}

/**
 * Computes actual risk for a recommended lot.
 *
 * @param slDistance - Stop loss distance
 * @param recommendedLotValue - Output of recommendedLot()
 * @param contractSize - Contract size
 * @returns Actual risk rounded to 10 decimal places
 */
export function actualRisk(
  slDistance: string,
  recommendedLotValue: string,
  contractSize: string,
): string {
  const slDist = parseFloat(slDistance);
  const lot = parseFloat(recommendedLotValue);
  const size = parseFloat(contractSize);

  return formatMoney((slDist * lot * size).toFixed(10));
}

/**
 * Computes risk/reward ratio.
 *
 * @param entryPrice - Entry price
 * @param takeProfit - Take profit price
 * @param stopLoss - Stop loss price
 * @returns R:R ratio rounded to 4 decimal places
 */
export function rrRatio(
  entryPrice: string,
  takeProfit: string,
  stopLoss: string,
): string {
  const entry = parseFloat(entryPrice);
  const tp = parseFloat(takeProfit);
  const sl = parseFloat(stopLoss);

  const reward = Math.abs(tp - entry);
  const risk = Math.abs(entry - sl);

  if (risk === 0) return '0';

  return (reward / risk).toFixed(4);
}

/**
 * Computes projected profit for a recommended lot.
 *
 * @param rrRatioValue - Output of rrRatio()
 * @param actualRiskValue - Output of actualRisk()
 * @returns Projected profit rounded to 10 decimal places
 */
export function projectedProfit(
  rrRatioValue: string,
  actualRiskValue: string,
): string {
  const rr = parseFloat(rrRatioValue);
  const risk = parseFloat(actualRiskValue);

  return formatMoney((rr * risk).toFixed(10));
}

/**
 * Checks if flooring moved actual risk more than 5% below risk amount.
 *
 * @param actualRiskValue - Output of actualRisk()
 * @param riskAmountValue - Risk amount
 * @returns True if warning should be shown
 */
export function flooringWarning(
  actualRiskValue: string,
  riskAmountValue: string,
): boolean {
  const actual = parseFloat(actualRiskValue);
  const riskAmt = parseFloat(riskAmountValue);

  if (riskAmt === 0) return false;

  const deviation = (riskAmt - actual) / riskAmt;
  return deviation > 0.05;
}

/**
 * Determines win/loss/breakeven from P&L.
 *
 * @param pnlValue - P&L value
 * @returns 'win' | 'loss' | 'breakeven'
 */
export function wlClassification(pnlValue: string): 'win' | 'loss' | 'breakeven' {
  const pnlNum = parseFloat(pnlValue);

  if (pnlNum > 0) return 'win';
  if (pnlNum < 0) return 'loss';
  return 'breakeven';
}

/**
 * Computes duration in minutes between entry and exit.
 *
 * @param entryTime - Entry time
 * @param exitTime - Exit time
 * @returns Duration in minutes (floor)
 */
export function durationMinutes(
  entryTime: Date,
  exitTime: Date,
): number {
  return Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000);
}