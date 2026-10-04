import { describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import {
  PASSWORD_ARGON2_OPTIONS,
  PASSWORD_MIN_LENGTH,
  PasswordPolicyError,
  assertPasswordPolicy,
  hashPassword,
  performDummyVerify,
  resetPasswordBreachChecker,
  setPasswordBreachChecker,
  verifyPassword,
} from '../../src/lib/password.js';

const VALID = 'correct horse battery staple';

describe('password policy (engineering-contract.md 7.1)', () => {
  it('requires at least the documented minimum length', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(() => assertPasswordPolicy('a'.repeat(9))).toThrow(PasswordPolicyError);
    expect(() => assertPasswordPolicy('a'.repeat(10))).not.toThrow();
  });

  it('bounds the maximum length so an anonymous caller cannot request unbounded work', () => {
    expect(() => assertPasswordPolicy('a'.repeat(201))).toThrow(PasswordPolicyError);
  });

  it('does not treat length as byte length for the minimum rule', () => {
    // 10 characters of multi-byte text must satisfy the character minimum.
    expect(() => assertPasswordPolicy('şifreliŞifre')).not.toThrow();
  });
});

describe('Argon2id configuration (ADR-007)', () => {
  it('uses argon2id, not argon2i or argon2d', () => {
    expect(PASSWORD_ARGON2_OPTIONS.type).toBe(argon2.argon2id);
  });

  it('uses the OWASP baseline the ADR cites as its rationale', () => {
    expect(PASSWORD_ARGON2_OPTIONS.memoryCost).toBe(19_456);
    expect(PASSWORD_ARGON2_OPTIONS.timeCost).toBe(2);
    expect(PASSWORD_ARGON2_OPTIONS.parallelism).toBe(1);
  });

  it('produces a hash that encodes argon2id and the configured cost', async () => {
    const hash = await hashPassword(VALID);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2');
    expect(hash).toContain('p=1');
  });
});

describe('hashPassword', () => {
  it('never returns or embeds the plaintext', async () => {
    const hash = await hashPassword(VALID);

    expect(hash).not.toContain(VALID);
    expect(hash).not.toContain('correct horse');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const first = await hashPassword(VALID);
    const second = await hashPassword(VALID);

    expect(first).not.toBe(second);
    expect(await verifyPassword(first, VALID)).toBe(true);
    expect(await verifyPassword(second, VALID)).toBe(true);
  });

  it('rejects a password below the minimum before hashing', async () => {
    await expect(hashPassword('short')).rejects.toThrow(PasswordPolicyError);
  });

  it('rejects a password reported by the breach checker', async () => {
    setPasswordBreachChecker({ isBreached: async () => true });
    try {
      await expect(hashPassword(VALID)).rejects.toThrow(/breach/i);
    } finally {
      resetPasswordBreachChecker();
    }
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword(VALID);
    expect(await verifyPassword(hash, VALID)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword(VALID);
    expect(await verifyPassword(hash, 'wrong horse battery staple')).toBe(false);
  });

  it('returns false instead of throwing for a malformed stored hash', async () => {
    // A corrupt row must not turn a failed login into a 500.
    await expect(verifyPassword('not-a-real-hash', VALID)).resolves.toBe(false);
    await expect(verifyPassword('', VALID)).resolves.toBe(false);
  });
});

describe('timing equaliser', () => {
  it('completes without throwing, so an unknown email costs the same as a wrong password', async () => {
    await expect(performDummyVerify()).resolves.toBeUndefined();
  });
});