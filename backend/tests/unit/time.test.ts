import { describe, expect, it } from 'vitest';
import {
  deriveSession,
  getSessionWindow,
  sessionWrapsMidnight,
  type MarketSession,
} from '../../src/lib/time.js';

/**
 * Boundary coverage for the canonical session interpretation locked in
 * docs/engineering-contract.md §5.3:
 *
 *   sydney    20:00 - 05:00 UTC (wraps midnight)
 *   tokyo     00:00 - 09:00 UTC
 *   london    07:00 - 16:00 UTC
 *   new_york  12:00 - 21:00 UTC
 *
 * Boundaries are left-closed, right-open, and overlaps are resolved by the
 * precedence order new_york > london > tokyo > sydney.
 */

/** Builds a UTC instant; the derivation reads only hours and minutes. */
function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 9, 1, hour, minute));
}

function expectSessionOverRange(
  expected: MarketSession,
  fromHour: number,
  fromMinute: number,
  toHour: number,
  toMinute: number,
): void {
  for (let minutes = fromHour * 60 + fromMinute; minutes < toHour * 60 + toMinute; minutes += 1) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    expect(`${hour}:${minute} -> ${deriveSession(at(hour, minute))}`).toBe(
      `${hour}:${minute} -> ${expected}`,
    );
  }
}

describe('deriveSession — documented boundaries', () => {
  it.each<[number, number, MarketSession]>([
    [0, 0, 'tokyo'],
    [4, 59, 'tokyo'],
    [5, 0, 'tokyo'],
    [6, 59, 'tokyo'],
    [7, 0, 'london'],
    [7, 45, 'london'],
    [8, 59, 'london'],
    [9, 0, 'london'],
    [11, 59, 'london'],
    [12, 0, 'new_york'],
    [15, 59, 'new_york'],
    [16, 0, 'new_york'],
    [19, 59, 'new_york'],
    [20, 0, 'new_york'],
    [20, 59, 'new_york'],
    [21, 0, 'sydney'],
    [23, 59, 'sydney'],
  ])('resolves %i:%i UTC to %s', (hour, minute, expected) => {
    expect(deriveSession(at(hour, minute))).toBe(expected);
  });

  it('resolves exactly 07:00:00Z to london, as §5.3 states', () => {
    expect(deriveSession(new Date(Date.UTC(2026, 9, 1, 7, 0, 0)))).toBe('london');
  });

  it('resolves exactly 16:00:00Z to new_york, as §5.3 states', () => {
    expect(deriveSession(new Date(Date.UTC(2026, 9, 1, 16, 0, 0)))).toBe('new_york');
  });

  it('resolves the §5.3 worked example 07:45:00Z to london', () => {
    expect(deriveSession(new Date(Date.UTC(2026, 8, 30, 7, 45, 0)))).toBe('london');
  });

  it('ignores seconds, so the boundary instants are stable', () => {
    expect(deriveSession(new Date(Date.UTC(2026, 9, 1, 6, 59, 59)))).toBe('tokyo');
    expect(deriveSession(new Date(Date.UTC(2026, 9, 1, 7, 0, 0)))).toBe('london');
  });
});

describe('deriveSession — the five consequences stated in §5.3', () => {
  it('00:00-05:00 UTC is tokyo, not sydney', () => {
    expectSessionOverRange('tokyo', 0, 0, 5, 0);
  });

  it('05:00-07:00 UTC is tokyo, because Tokyo is defined as 00:00-09:00 UTC', () => {
    expectSessionOverRange('tokyo', 5, 0, 7, 0);
  });

  it('07:00-09:00 UTC is london, not tokyo', () => {
    expectSessionOverRange('london', 7, 0, 9, 0);
  });

  it('12:00-16:00 UTC is new_york, not london', () => {
    expectSessionOverRange('new_york', 12, 0, 16, 0);
  });

  it('20:00-21:00 UTC is new_york, not sydney', () => {
    expectSessionOverRange('new_york', 20, 0, 21, 0);
  });
});

describe('deriveSession — window coverage', () => {
  it('resolves every minute of the UTC day without falling through', () => {
    const sessions = new Set<MarketSession>();

    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const session = deriveSession(at(Math.floor(minutes / 60), minutes % 60));
      expect(['sydney', 'tokyo', 'london', 'new_york']).toContain(session);
      sessions.add(session);
    }

    expect([...sessions].sort()).toEqual(['london', 'new_york', 'sydney', 'tokyo']);
  });

  it('is independent of the calendar date and of the local timezone', () => {
    const winter = new Date(Date.UTC(2026, 0, 15, 6, 0, 0));
    const summer = new Date(Date.UTC(2026, 6, 15, 6, 0, 0));

    expect(deriveSession(winter)).toBe('tokyo');
    expect(deriveSession(summer)).toBe('tokyo');
  });
});

describe('session window metadata', () => {
  it('marks only sydney as wrapping midnight', () => {
    expect(sessionWrapsMidnight('sydney')).toBe(true);
    expect(sessionWrapsMidnight('tokyo')).toBe(false);
    expect(sessionWrapsMidnight('london')).toBe(false);
    expect(sessionWrapsMidnight('new_york')).toBe(false);
  });

  it('reports the documented UTC windows in minutes from midnight', () => {
    expect(getSessionWindow('tokyo')).toEqual([[0, 9 * 60]]);
    expect(getSessionWindow('london')).toEqual([[7 * 60, 16 * 60]]);
    expect(getSessionWindow('new_york')).toEqual([[12 * 60, 21 * 60]]);
    expect(getSessionWindow('sydney')).toEqual([[20 * 60, 24 * 60], [0, 5 * 60]]);
  });
});