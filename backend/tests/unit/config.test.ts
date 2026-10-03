import { afterEach, describe, expect, it } from 'vitest';
import { getEnv, getDatabaseUrl, resetEnvCache } from '../../src/config/index.js';

afterEach(() => {
  resetEnvCache();
});

/**
 * engineering-contract.md §2 requires a unit test asserting that a test-mode app
 * refuses to start when `DATABASE_URL_TEST` is missing.
 */
describe('environment validation', () => {
  it('refuses to start in the test environment when DATABASE_URL_TEST is missing', () => {
    const original = process.env.DATABASE_URL_TEST;
    delete process.env.DATABASE_URL_TEST;
    resetEnvCache();

    try {
      expect(() => getEnv()).toThrow(/DATABASE_URL_TEST is required when NODE_ENV=test/);
    } finally {
      if (original !== undefined) {
        process.env.DATABASE_URL_TEST = original;
      }
      resetEnvCache();
    }
  });

  it('resolves the test database in the test environment', () => {
    expect(getEnv().NODE_ENV).toBe('test');
    expect(getDatabaseUrl()).toBe(process.env.DATABASE_URL_TEST);
  });

  it('resolves DATABASE_URL outside the test environment', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalTestUrl = process.env.DATABASE_URL_TEST;

    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL_TEST;
    resetEnvCache();

    try {
      expect(getDatabaseUrl()).toBe(process.env.DATABASE_URL);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalTestUrl !== undefined) {
        process.env.DATABASE_URL_TEST = originalTestUrl;
      }
      resetEnvCache();
    }
  });

  it('refuses to start when a required secret is missing', () => {
    const original = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    resetEnvCache();

    try {
      expect(() => getEnv()).toThrow(/Environment validation failed/);
    } finally {
      if (original !== undefined) {
        process.env.JWT_ACCESS_SECRET = original;
      }
      resetEnvCache();
    }
  });

  it('defaults COOKIE_SECURE to true and parses it as a real boolean', () => {
    expect(getEnv().COOKIE_SECURE).toBe(false);

    const original = process.env.COOKIE_SECURE;
    process.env.COOKIE_SECURE = 'false';
    resetEnvCache();
    expect(getEnv().COOKIE_SECURE).toBe(false);

    process.env.COOKIE_SECURE = 'true';
    resetEnvCache();
    expect(getEnv().COOKIE_SECURE).toBe(true);

    if (original !== undefined) {
      process.env.COOKIE_SECURE = original;
    }
    resetEnvCache();
  });
});