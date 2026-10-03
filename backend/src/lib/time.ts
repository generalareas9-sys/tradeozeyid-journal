/**
 * Time utilities for market session derivation and timezone handling.
 * All timestamps are stored and returned in UTC (ISO-8601 with Z suffix).
 */

export type MarketSession = 'sydney' | 'tokyo' | 'london' | 'new_york';

/**
 * Session boundaries in UTC (24-hour format).
 * Windows are half-open [start, end).
 * Overlaps are resolved by precedence order.
 */
const SESSION_BOUNDARIES: readonly (readonly [MarketSession, number, number, boolean])[] = [
  ['new_york', 12, 21, false],    // 12:00 - 21:00 UTC
  ['london', 7, 16, false],       // 07:00 - 16:00 UTC
  ['tokyo', 0, 9, false],         // 00:00 - 09:00 UTC
  ['sydney', 20, 5, true],        // 20:00 - 05:00 UTC (wraps midnight)
];

/**
 * Derives the market session from a UTC timestamp.
 *
 * Windows are left-closed and right-open, and together they cover every minute
 * of the UTC day. Overlaps are resolved by the fixed precedence order
 * `new_york` > `london` > `tokyo` > `sydney`, which is why 05:00-07:00 UTC is
 * `tokyo`: Tokyo's window is 00:00-09:00 and no higher-precedence window
 * matches there.
 *
 * See engineering-contract.md §5.3.
 *
 * @param utcDate - The UTC date/time to derive session for
 * @returns The market session enum value
 */
export function deriveSession(utcDate: Date): MarketSession {
  const utcHour = utcDate.getUTCHours();
  const utcMinutes = utcDate.getUTCMinutes();
  const timeInMinutes = utcHour * 60 + utcMinutes;

  for (const [session, startHour, endHour, wrapsMidnight] of SESSION_BOUNDARIES) {
    const start = startHour * 60;
    const end = endHour * 60;

    if (wrapsMidnight) {
      // Sydney wraps midnight: 20:00 - 24:00 and 00:00 - 05:00
      if (timeInMinutes >= start || timeInMinutes < end) {
        return session;
      }
    } else {
      // Normal window: [start, end)
      if (timeInMinutes >= start && timeInMinutes < end) {
        return session;
      }
    }
  }

  // Unreachable: tokyo (00:00-09:00) ∪ london (07:00-16:00) ∪
  // new_york (12:00-21:00) ∪ sydney (20:00-05:00) is the whole day, and
  // `timeInMinutes` is always within 0-1439. There is no gap to fill, so an
  // unmatched value is a broken window table rather than a missing rule.
  throw new Error(
    `deriveSession: no session window matched UTC clock time ${timeInMinutes} minutes.`,
  );
}

/**
 * Checks if a session window wraps midnight.
 */
export function sessionWrapsMidnight(session: MarketSession): boolean {
  const boundary = SESSION_BOUNDARIES.find(([s]) => s === session);
  return boundary?.[3] ?? false;
}

/**
 * Gets the UTC window for a session as [startMinutes, endMinutes] from midnight.
 * For wrapped sessions, returns two ranges.
 */
export function getSessionWindow(session: MarketSession): [number, number][] {
  const boundary = SESSION_BOUNDARIES.find(([s]) => s === session);
  if (!boundary) return [];

  const [, startHour, endHour, wrapsMidnight] = boundary;
  const start = startHour * 60;
  const end = endHour * 60;

  if (wrapsMidnight) {
    return [[start, 24 * 60], [0, end]];
  }
  return [[start, end]];
}

/**
 * Formats a Date as ISO-8601 UTC string with Z suffix.
 */
export function toISOStringUtc(date: Date): string {
  return date.toISOString();
}

/**
 * Parses an ISO-8601 UTC string to Date.
 */
export function parseISOStringUtc(isoString: string): Date {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO-8601 date string: ${isoString}`);
  }
  return date;
}

/**
 * Gets the start of day in a given timezone (as UTC Date).
 * Used for calendar analytics grouping.
 */
export function startOfDayInTimezone(date: Date, timezone: string): Date {
  // Use Intl.DateTimeFormat to get the date components in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);

  // Return UTC midnight of that local date
  return new Date(Date.UTC(year, month, day));
}

/**
 * Gets the end of day in a given timezone (as UTC Date).
 */
export function endOfDayInTimezone(date: Date, timezone: string): Date {
  const start = startOfDayInTimezone(date, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Validates an IANA timezone identifier.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Calculates duration in minutes between two dates.
 */
export function durationMinutes(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 60000);
}