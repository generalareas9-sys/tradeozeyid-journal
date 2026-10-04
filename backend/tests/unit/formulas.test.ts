import { describe, expect, it } from 'vitest';
import {
  priceDelta,
  grossPnl,
  pnl,
  plannedRisk,
  rMultiple,
  riskAmount,
  riskPercent,
  exactLot,
  recommendedLot,
  actualRisk,
  rrRatio,
  projectedProfit,
  flooringWarning,
  wlClassification,
  durationMinutes,
} from '../../src/analytics/formulas.js';

/**
 * Unit tests for canonical formulas (database-schema.md §5).
 *
 * Each test uses the worked examples from the spec so the formulas are
 * pinned to their documented behaviour. All inputs and outputs are
 * decimal strings — the formulas are the single source of truth and
 * are used by the trade service, analytics engine and risk calculator.
 */

describe('priceDelta', () => {
  it('long: exit - entry', () => {
    expect(priceDelta('2415.33', '2418.94', 'long')).toBe('3.6100000000');
  });

  it('short: entry - exit', () => {
    expect(priceDelta('2415.33', '2412.83', 'short')).toBe('2.5000000000');
  });
});

describe('grossPnl', () => {
  it('multiplies priceDelta × quantity × contractSize', () => {
    expect(grossPnl('3.61', '0.40', '1')).toBe('1.4440000000');
    expect(grossPnl('2.50', '1.00', '100')).toBe('250.0000000000');
  });
});

describe('pnl', () => {
  it('rounds gross - fees + swap to 10 dp', () => {
    // Worked example from §5.1: gross 1.444, fees 1.20, swap -0.80
    expect(pnl('1.4440000000', '1.20', '-0.80')).toBe('-0.5560000000');
  });

  it('handles zero fees and swap', () => {
    expect(pnl('100.0000000000', '0', '0')).toBe('100.0000000000');
  });

  it('positive swap adds to P&L', () => {
    expect(pnl('10.0000000000', '1.00', '0.50')).toBe('9.5000000000');
  });
});

describe('plannedRisk', () => {
  it('|entry - stopLoss| × quantity × contractSize, rounded to 10 dp', () => {
    // long entry 2415.33, sl 2412.83, qty 0.40, size 1
    expect(plannedRisk('2415.33', '2412.83', '0.40', '1')).toBe('1.0000000000');
    // short entry 2415.33, sl 2418.94, qty 1.0, size 1
    expect(plannedRisk('2415.33', '2418.94', '1', '1')).toBe('3.6100000000');
  });
});

describe('rMultiple', () => {
  it('pnl / plannedRisk rounded to 4 dp', () => {
    expect(rMultiple('100.0000000000', '100.0000000000')).toBe('1.0000');
    expect(rMultiple('-100.0000000000', '100.0000000000')).toBe('-1.0000');
    expect(rMultiple('150.0000000000', '100.0000000000')).toBe('1.5000');
    expect(rMultiple('0', '100.0000000000')).toBe('0.0000');
  });

  it('returns 0 when plannedRisk is 0', () => {
    expect(rMultiple('100.0000000000', '0')).toBe('0');
  });

  it('stop-loss-out invariant: rMultiple = -1.0000', () => {
    // P&L exactly equals -plannedRisk at stop loss
    expect(rMultiple('-1.0000000000', '1.0000000000')).toBe('-1.0000');
  });
});

describe('riskAmount / riskPercent', () => {
  it('riskAmount = balance × riskPercent/100', () => {
    expect(riskAmount('10000', '1')).toBe('100.0000000000');
    expect(riskAmount('10000', '1.25')).toBe('125.0000000000');
  });

  it('riskPercent = riskAmount / balance × 100', () => {
    expect(riskPercent('100', '10000')).toBe('1.000');
    expect(riskPercent('125', '10000')).toBe('1.250');
  });

  it('riskPercent returns 0 when balance is 0', () => {
    expect(riskPercent('100', '0')).toBe('0.000');
  });
});

describe('exactLot', () => {
  it('riskAmount / (slDistance × contractSize)', () => {
    // risk 100, slDistance 2.5, contractSize 1
    expect(exactLot('100', '2.50', '1')).toBe('40.0000000000');
  });

  it('returns 0 when slDistance × contractSize is 0', () => {
    expect(exactLot('100', '0', '1')).toBe('0.0000000000');
  });
});

describe('recommendedLot', () => {
  it('floors to lotStep and clamps to min/max', () => {
    // exact 40.00, step 0.01, min 0.01, max 100
    expect(recommendedLot('40.0000000000', '0.01', '0.01', '100')).toBe('40.00');
    // exact 40.007, step 0.01 → floors to 40.00
    expect(recommendedLot('40.007', '0.01', '0.01', '100')).toBe('40.00');
    // below min
    expect(recommendedLot('0.005', '0.01', '0.01', '100')).toBe('0.01');
    // above max
    expect(recommendedLot('150', '0.01', '0.01', '100')).toBe('100.00');
  });
});

describe('actualRisk', () => {
  it('slDistance × recommendedLot × contractSize', () => {
    expect(actualRisk('2.50', '40.00', '1')).toBe('100.0000000000');
  });
});

describe('rrRatio', () => {
  it('|takeProfit - entry| / |entry - stopLoss|', () => {
    // entry 2415.33, tp 2421.33, sl 2412.83
    expect(rrRatio('2415.33', '2421.33', '2412.83')).toBe('2.4000');
  });

  it('returns 0 when risk distance is 0', () => {
    expect(rrRatio('100', '110', '100')).toBe('0');
  });
});

describe('projectedProfit', () => {
  it('rrRatio × actualRisk', () => {
    expect(projectedProfit('2.4000', '100.0000000000')).toBe('240.0000000000');
  });
});

describe('flooringWarning', () => {
  it('true when deviation > 5%', () => {
    // actual 94, risk 100 → deviation 6% > 5%
    expect(flooringWarning('94', '100')).toBe(true);
  });

  it('false when deviation ≤ 5%', () => {
    expect(flooringWarning('95', '100')).toBe(false);
    expect(flooringWarning('100', '100')).toBe(false);
  });

  it('false when riskAmt is 0', () => {
    expect(flooringWarning('0', '0')).toBe(false);
  });
});

describe('wlClassification', () => {
  it('win when P&L > 0', () => {
    expect(wlClassification('0.01')).toBe('win');
    expect(wlClassification('100')).toBe('win');
  });

  it('loss when P&L < 0', () => {
    expect(wlClassification('-0.01')).toBe('loss');
    expect(wlClassification('-100')).toBe('loss');
  });

  it('breakeven when P&L = 0', () => {
    expect(wlClassification('0')).toBe('breakeven');
  });
});

describe('durationMinutes', () => {
  it('floors minutes between entry and exit', () => {
    const entry = new Date('2026-09-30T07:45:00Z');
    const exit = new Date('2026-09-30T09:12:00Z');
    expect(durationMinutes(entry, exit)).toBe(87);
  });

  it('returns 0 for same time', () => {
    const now = new Date();
    expect(durationMinutes(now, now)).toBe(0);
  });
});