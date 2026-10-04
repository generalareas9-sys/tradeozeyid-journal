import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { passwordResetTokens, refreshTokens, users } from '../../src/db/schema/auth.js';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';

/**
 * CSRF double-submit in cookie mode (engineering-contract.md §7.5, api-spec.md §2.2).
 *
 * The rest of the Phase 3 API suite runs with `authMode: 'bearer'` so a test
 * client can drive cookie-protected endpoints without replaying a CSRF token. That
 * makes this file the only place the production rule is exercised, so it builds a
 * **cookie-mode** app — the same construction a production listener uses — and
 * drives real requests through it.
 */

const REGISTER = {
  email: 'trader@example.com',
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

function cookieValue(response: request.Response, name: string): string | undefined {
  const raw = response.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));

  return match?.split(';')[0]?.replace(`${name}=`, '');
}

/**
 * Bootstraps a real token through `GET /auth/csrf` (api-spec.md §2.2.1) and
 * returns the value to echo in `X-CSRF-Token`.
 *
 * This is deliberately the production path rather than a hand-written pair: an
 * earlier revision of this file sent a made-up `bootstrap-token`, which proved the
 * middleware compares two strings but not that a fresh browser can obtain one.
 */
async function bootstrapCsrfToken(): Promise<string> {
  const response = await request(app).get('/api/v1/auth/csrf').expect(200);
  const token = response.body?.data?.csrfToken;

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('GET /auth/csrf did not return a csrfToken');
  }

  return token;
}

/** Registers through the real bootstrap and returns the rotated cookie. */
async function registerAndReadCsrfCookie(email = REGISTER.email): Promise<string> {
  const token = await bootstrapCsrfToken();

  const response = await request(app)
    .post('/api/v1/auth/register')
    .set('Cookie', [`csrf_token=${token}`])
    .set('X-CSRF-Token', token)
    .send({ ...REGISTER, email })
    .expect(201);

  const csrf = cookieValue(response, 'csrf_token');
  if (!csrf) {
    throw new Error('register did not set a csrf_token cookie');
  }

  return csrf;
}

beforeAll(() => {
  // Deliberately the default: cookie mode, exactly as production constructs it.
  app = createApp();
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  resetRateLimitStores();
  await truncateAuthTables();
});

describe('CSRF double-submit is enforced in cookie mode', () => {
  it('refuses a state-changing request that carries no CSRF token at all', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...REGISTER, email: 'nocookie@example.com' })
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('refuses a request whose cookie and header disagree', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', ['csrf_token=one-token'])
      .set('X-CSRF-Token', 'a-different-token')
      .send({ ...REGISTER, email: 'mismatch@example.com' })
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('refuses a request that sends the header but no cookie', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('X-CSRF-Token', 'a-token-with-no-cookie')
      .send({ ...REGISTER, email: 'nocookievalue@example.com' })
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('refuses a request that sends the cookie but no header', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', ['csrf_token=a-cookie-with-no-header'])
      .send({ ...REGISTER, email: 'noheader@example.com' })
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('accepts the request when the cookie and header match', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', ['csrf_token=matching-token'])
      .set('X-CSRF-Token', 'matching-token')
      .send({ ...REGISTER, email: 'accepted@example.com' })
      .expect(201);

    expect(response.body.data.email).toBe('accepted@example.com');
  });

  it('accepts a real login round trip with the issued token', async () => {
    const csrf = await registerAndReadCsrfCookie('roundtrip@example.com');

    await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', [`csrf_token=${csrf}`])
      .set('X-CSRF-Token', csrf)
      .send({ email: 'roundtrip@example.com', password: REGISTER.password })
      .expect(200);
  });

  it('does not demand a CSRF token on a safe method', async () => {
    await request(app).get('/api/v1/health').expect(200);
  });

  it('exempts a request authenticated solely by the Authorization header', async () => {
    // api-spec.md §2.2. Reachable only under NODE_ENV=test, because the auth
    // middleware rejects bearer outside it; this asserts the CSRF rule itself.
    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer some-test-token')
      .send({ currentPassword: 'irrelevant', newPassword: 'irrelevant' })
      .expect(401);

    // It got past CSRF (not 403) and was stopped by authentication, which is the
    // boundary this case is here to prove.
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('uses the documented envelope for the rejection', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...REGISTER, email: 'envelope@example.com' })
      .expect(403);

    expect(response.body).toMatchObject({
      error: { code: 'CSRF_FAILED', message: 'CSRF token missing or invalid' },
    });
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('rotates the CSRF token on login', async () => {
    const before = await registerAndReadCsrfCookie('rotate@example.com');

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', [`csrf_token=${before}`])
      .set('X-CSRF-Token', before)
      .send({ email: 'rotate@example.com', password: REGISTER.password })
      .expect(200);

    const after = cookieValue(response, 'csrf_token');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});

/**
 * api-spec.md §2.2.1. Added because cookie mode was previously unusable: the
 * token was only ever set after register, login or refresh, and all three are
 * guarded unsafe methods, so no fresh browser could ever satisfy the rule above.
 */
describe('GET /auth/csrf bootstraps the double-submit token', () => {
  it('returns the token in the documented envelope', async () => {
    const response = await request(app).get('/api/v1/auth/csrf').expect(200);

    expect(response.body.data.csrfToken).toEqual(expect.any(String));
    expect(response.body.data.csrfToken.length).toBeGreaterThanOrEqual(32);
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('sets the csrf_token cookie to the same value it returns', async () => {
    const response = await request(app).get('/api/v1/auth/csrf').expect(200);

    expect(cookieValue(response, 'csrf_token')).toBe(response.body.data.csrfToken);
  });

  it('sets the cookie readable by script, because double-submit needs it', async () => {
    const response = await request(app).get('/api/v1/auth/csrf').expect(200);
    const raw: string[] = Array.isArray(response.headers['set-cookie'])
      ? (response.headers['set-cookie'] as string[])
      : [String(response.headers['set-cookie'])];
    const csrfCookie = raw.find((c) => c.startsWith('csrf_token='));

    expect(csrfCookie).toBeTruthy();
    expect(csrfCookie).not.toMatch(/httponly/i);
  });

  it('is reachable with no session and no existing cookie', async () => {
    // The whole point: a fresh browser arrives with nothing.
    await request(app).get('/api/v1/auth/csrf').expect(200);
  });

  it('needs no CSRF token itself, because it is a GET', async () => {
    // If it were guarded it could never bootstrap, so this pins the reason it works.
    await request(app).get('/api/v1/auth/csrf').expect(200);
  });

  it('enables a full sign-in round trip from a completely fresh client', async () => {
    const token = await bootstrapCsrfToken();

    await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', [`csrf_token=${token}`])
      .set('X-CSRF-Token', token)
      .send({ ...REGISTER, email: 'bootstrap@example.com' })
      .expect(201);

    await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', [`csrf_token=${token}`])
      .set('X-CSRF-Token', token)
      .send({ email: 'bootstrap@example.com', password: REGISTER.password })
      .expect(200);
  });

  it('issues a different token on each call', async () => {
    const first = await bootstrapCsrfToken();
    const second = await bootstrapCsrfToken();

    expect(second).not.toBe(first);
  });

  it('compares cookie against header and holds no server-side token state', async () => {
    const first = await bootstrapCsrfToken();

    // Deliberately asserting the weaker behaviour, because it is the specified
    // one. The double-submit rule is a comparison of the two values the client
    // presents; the server never records which tokens it issued, so a token from
    // an earlier bootstrap still validates as long as it is echoed in both places.
    // Rotation on login and refresh therefore replaces the value in the browser
    // rather than revoking the old one.
    //
    // This is safe under the recorded topology — same-origin production hosting
    // with `SameSite=strict` (§7.2) — and is exactly why the contract calls the
    // token "defence-in-depth" and says it "carries no authority on its own"
    // (§2.1). It would NOT be sufficient for the split-origin topology §7.2
    // records as the option that was not taken.
    await request(app)
      .post('/api/v1/auth/register')
      .set('Cookie', [`csrf_token=${first}`])
      .set('X-CSRF-Token', first)
      .send({ ...REGISTER, email: 'superseded@example.com' })
      .expect(201);
  });

  it('writes no audit row, because it grants no authority', async () => {
    await request(app).get('/api/v1/auth/csrf').expect(200);

    const db = getDb();
    const { auditLog } = await import('../../src/db/schema/audit.js');
    const rows = await db.select().from(auditLog);

    expect(rows).toHaveLength(0);
  });

  it('creates no user and no token family', async () => {
    await request(app).get('/api/v1/auth/csrf').expect(200);

    const db = getDb();

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(refreshTokens)).toHaveLength(0);
  });

  it('rate limits at 60 per minute per IP', async () => {
    const fromIp = (octet: number) => `198.51.100.${octet}`;

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For', fromIp(1)).expect(200);
    }

    const blocked = await request(app)
      .get('/api/v1/auth/csrf')
      .set('X-Forwarded-For', fromIp(1))
      .expect(429);

    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    // A different address is unaffected: the limit is per IP, not global.
    await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For', fromIp(2)).expect(200);
  });
});
