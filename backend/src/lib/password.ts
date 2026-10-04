import argon2 from 'argon2';

/**
 * Password hashing (engineering-contract.md §7.1, ADR-007).
 *
 * §7.1 mandates Argon2id with a minimum of 10 characters. It does not fix the
 * cost parameters, so this module uses the OWASP Password Storage Cheat Sheet
 * baseline that ADR-007 cites as its rationale: 19 MiB of memory, two
 * iterations, single-threaded. These are the values to revisit if the owner
 * records a different baseline; they are deliberately declared once here so a
 * change is a single edit.
 */
export const PASSWORD_ARGON2_OPTIONS = {
  /** argon2id, not argon2i or argon2d (ADR-007). */
  type: argon2.argon2id,
  /** 19,456 KiB = 19 MiB. */
  memoryCost: 19_456,
  /** Two passes over the memory. */
  timeCost: 2,
  /** lanes = 1: the lowest value OWASP accepts. */
  parallelism: 1,
} as const;

/** engineering-contract.md §7.1: "minimum 10 characters". */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * The breach-list seam required by §7.1: "checked against a breach list when a
 * service is available".
 *
 * No breach-list provider is approved (ADR-012 defers external services), and
 * offline development has no such service. This interface is the documented
 * seam so a provider can be wired later without touching call sites — the same
 * pattern the phase plan mandates for email transport. The default
 * implementation permits everything.
 */
export interface PasswordBreachChecker {
  /** Resolves true when the password appears in a known breach corpus. */
  isBreached(password: string): Promise<boolean>;
}

/** Permissive default: no provider is configured, so nothing is rejected. */
export const noBreachChecker: PasswordBreachChecker = {
  async isBreached(): Promise<boolean> {
    return false;
  },
};

let breachChecker: PasswordBreachChecker = noBreachChecker;

/** Swaps the breach checker. Tests use this to exercise the rejection path. */
export function setPasswordBreachChecker(checker: PasswordBreachChecker): void {
  breachChecker = checker;
}

export function resetPasswordBreachChecker(): void {
  breachChecker = noBreachChecker;
}

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

/**
 * Enforces the §7.1 character minimum. Called before hashing so an invalid
 * password never reaches Argon2, and independently of hashing so the rule has a
 * single implementation.
 */
export function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }

  if (password.length > 200) {
    // Argon2 itself has no input limit; this bounds the work an unauthenticated
    // caller can request during registration or a password change.
    throw new PasswordPolicyError('Password must be at most 200 characters');
  }
}

/**
 * Hashes a password for storage.
 *
 * The plaintext is never returned, logged or persisted. Only the encoded
 * Argon2id string — which embeds the algorithm, cost parameters and a random
 * salt — reaches the database.
 */
export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);

  if (await breachChecker.isBreached(password)) {
    throw new PasswordPolicyError('Password appears in a known breach corpus');
  }

  return argon2.hash(password, { ...PASSWORD_ARGON2_OPTIONS });
}

/**
 * Verifies a candidate password against a stored hash.
 *
 * Returns false rather than throwing for a malformed stored hash, so a corrupt
 * row cannot turn a failed login into a 500. Callers must not distinguish
 * "wrong password" from "unknown user" (api-spec.md §9.2 requires no
 * user-enumeration signal).
 */
export async function verifyPassword(storedHash: string, candidate: string): Promise<boolean> {
  if (!storedHash) return false;

  try {
    return await argon2.verify(storedHash, candidate);
  } catch {
    return false;
  }
}

/**
 * A dummy verification against a throwaway hash.
 *
 * Login calls this when the email is unknown, so an attacker cannot distinguish
 * "no such account" from "wrong password" by response time: both paths perform
 * one Argon2id verification.
 */
let dummyHashPromise: Promise<string> | null = null;

async function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('tradeozeyid-timing-equaliser', {
      ...PASSWORD_ARGON2_OPTIONS,
    });
  }

  return dummyHashPromise;
}

export async function performDummyVerify(): Promise<void> {
  await verifyPassword(await getDummyHash(), 'not-the-password');
}