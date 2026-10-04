/**
 * Client-side validation.
 *
 * Deliberately hand-rolled: the frontend has no schema library and
 * `AGENTS.md` §2.2 forbids adding a dependency without written justification.
 * These checks exist for feedback speed only — the server revalidates every
 * field with Zod and its error is what the user ultimately sees.
 *
 * The minimum length mirrors `engineering-contract.md` §7.1 (10 characters) so
 * the user is not told "too short" only after a round trip.
 */

export const PASSWORD_MIN_LENGTH = 10;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  if (value.trim().length === 0) return 'Email is required';
  if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (value.length === 0) return 'Password is required';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  return undefined;
}

export function validateDisplayName(value: string): string | undefined {
  if (value.trim().length === 0) return 'Display name is required';
  if (value.trim().length > 80) return 'Display name must be 80 characters or fewer';
  return undefined;
}

export type FieldErrors = Record<string, string | undefined>;

/** True when at least one field carries a message. */
export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((message) => typeof message === 'string');
}

/**
 * A browser-accepted timezone. Defaults to UTC, which is also the database
 * default (`ck_users_timezone`).
 */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}