import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { passwordResetTokens, refreshTokens, users } from '../../src/db/schema/auth.js';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';
import { resetEnvCache } from '../../src/config/index.js';

/**
 * Auth endpoint rate limiting (engineering-contract.md §7.9, api-spec.md §9.2).
 *
 * §7.9 requires per-IP **and** per-user on the auth endpoints, and explains that a
 * single-dimension key satisfies neither requirement on its own. These tests
 * therefore isolate each dimension rather than only testing that "some" limit
 * eventually fires: one case varies the email from a fixed address (so only the IP
 * counter can trip) and the other varies the address for one email (so only the
 * account counter can trip).
 *
 * Bearer mode is used so these tests exercise the limiter rather than CSRF;
 * the limiters run before both validation and CSRF-relevant handlers.
 */

const REGISTER = {
  password: 'correct horse battery',
  displayName: 'Ozeyid',
  timezone: 'Europe/Istanbul',
  baseCurrency: 'USD',
};

let app: Express;

async function truncateAuthTables(): Promise<void> {
  const db = getDb();
  const { auditLog } = await import('../../src/db/schema/audit.js');
  await db.delete(auditLog);
  await db.delete(passwordResetTokens);
  await db.delete(refreshTokens);
  await db.delete(users);
}

/** A distinct synthetic source address, since `trust proxy` honours this header. */
function fromIp(index: number): string {
  return `203.0.113.${index}`;
}

beforeAll(() => {
  process.env.ALLOW_TEST_BEARER = 'true';
  resetEnvCache();
  app = createApp({ authMode: 'bearer' });
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  resetRateLimitStores();
  resetEnvCache();
  await truncateAuthTables();
});

describe('rate limiting on auth endpoints', () => {
  it('publishes the limit headers on a permitted request', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', fromIp(1))
      .send({ ...REGISTER, email: 'headers@example.com' })
      .expect(201);

    expect(response.headers['x-ratelimit-limit']).toBe('5');
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
    expect(response.headers['x-ratelimit-reset']).toBeTruthy();
  });

  it('allows five registrations an hour and refuses the sixth', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', fromIp(2))
        .send({ ...REGISTER, email: `register-${attempt}@example.com` })
        .expect(201);
    }

    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', fromIp(2))
      .send({ ...REGISTER, email: 'register-6@example.com' })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeTruthy();
    expect(response.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('gives each source address its own registration allowance', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', fromIp(3))
        .send({ ...REGISTER, email: `per-ip-${attempt}@example.com` })
        .expect(201);
    }

    // A different address is unaffected by the first address exhausting its window.
    await request(app)
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', fromIp(4))
      .send({ ...REGISTER, email: 'other-ip@example.com' })
      .expect(201);
  });

  it('limits login per IP when the submitted accounts all differ', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      // Wrong password on purpose: a limiter must count failures, not successes.
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', fromIp(5))
        .send({ email: `sprayed-${attempt}@example.com`, password: 'wrong-password' })
        .expect(401);
    }

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', fromIp(5))
      .send({ email: 'sprayed-11@example.com', password: 'wrong-password' })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeTruthy();
  });

  it('limits login per account even when every attempt comes from a new address', async () => {
    // Ten distinct addresses, one account: only the per-account counter can trip.
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', fromIp(100 + attempt))
        .send({ email: 'victim@example.com', password: 'wrong-password' })
        .expect(401);
    }

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', fromIp(200))
      .send({ email: 'victim@example.com', password: 'wrong-password' })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('allows three forgot-password requests an hour for one address', async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', fromIp(6))
        .send({ email: 'reset-me@example.com' })
        .expect(202);
    }

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', fromIp(6))
      .send({ email: 'reset-me@example.com' })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('allows five reset-password requests an hour', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      // The token is unknown, so each one is a 404 — the limiter runs first and
      // still counts the attempt, which is the point of testing it here.
      await request(app)
        .post('/api/v1/auth/reset-password')
        .set('X-Forwarded-For', fromIp(7))
        .send({ token: `unknown-${attempt}`, password: REGISTER.password })
        .expect(404);
    }

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .set('X-Forwarded-For', fromIp(7))
      .send({ token: 'unknown-6', password: REGISTER.password })
      .expect(429);

    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('uses the documented envelope for the rejection', async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', fromIp(8))
        .send({ email: 'envelope@example.com' })
        .expect(202);
    }

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', fromIp(8))
      .send({ email: 'envelope@example.com' })
      .expect(429);

    expect(response.body).toMatchObject({
      error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
    });
    expect(response.body.meta.requestId).toBeTruthy();
  });
});
