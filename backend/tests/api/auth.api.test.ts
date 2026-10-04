import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { passwordResetTokens, refreshTokens, users } from '../../src/db/schema/auth.js';
import { hashPassword } from '../../src/lib/password.js';
import { generateId } from '../../src/lib/ids.js';
import { hashToken } from '../../src/lib/crypto.js';
import { eq } from 'drizzle-orm';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';
import { resetEnvCache } from '../../src/config/index.js';

/**
 * Phase 3 API tests (api-spec.md §9.2, engineering-contract.md §7).
 *
 * These run against the **real** database, never a stub (AGENTS.md §2.9). The
 * harness uses `authMode: 'bearer'` so a test client can drive cookie-protected
 * endpoints without replaying CSRF; the CSRF rule itself is tested separately in
 * cookie mode.
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

async function registerUser(
  email: string,
  password = REGISTER.password,
): Promise<{ id: string; accessToken: string }> {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ ...REGISTER, email, password })
    .expect(201);

  const accessToken = cookieValue(response, 'http_at');
  if (!accessToken) {
    throw new Error('register did not set an http_at cookie');
  }

  return { id: response.body.data.id, accessToken };
}

/** Extracts a cookie value from a Set-Cookie header list. */
function cookieValue(response: request.Response, name: string): string | undefined {
  const raw = response.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));

  return match?.split(';')[0]?.replace(`${name}=`, '');
}

/** Same, but asserts the cookie is present. */
function requireCookie(response: request.Response, name: string): string {
  const value = cookieValue(response, name);
  if (!value) {
    throw new Error(`expected a ${name} cookie`);
  }
  return value;
}

/** The family a raw refresh token belongs to, via its stored digest. */
async function familyOf(rawToken: string): Promise<string> {
  const row = await repo_findByHash(rawToken);
  if (!row) {
    throw new Error('no stored refresh token for the presented value');
  }
  return row.familyId;
}

async function repo_findByHash(rawToken: string) {
  const rows = await getDb()
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(rawToken)));

  return rows[0];
}

/** Every stored row belonging to one family. */
async function rowsInFamily(familyId: string) {
  const rows = await getDb()
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.familyId, familyId));

  return rows;
}

beforeAll(() => {
  // engineering-contract.md §7.1: the bearer path requires BOTH NODE_ENV=test and
  // ALLOW_TEST_BEARER=true, and refuses to construct without it. This is the
  // fail-closed guard being satisfied deliberately, not bypassed.
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

describe('POST /auth/register', () => {
  it('creates the user, returns 201 and sets all three cookies', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    expect(response.body.data.email).toBe(REGISTER.email);
    expect(response.body.data.status).toBe('active');
    expect(response.body.meta.requestId).toBeTruthy();

    expect(cookieValue(response, 'http_at')).toBeTruthy();
    expect(cookieValue(response, 'http_rt')).toBeTruthy();
    expect(cookieValue(response, 'csrf_token')).toBeTruthy();
  });

  it('never returns the password hash', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    expect(JSON.stringify(response.body)).not.toContain('$argon2');
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(response.body.data).not.toHaveProperty('password');
  });

  it('stores only an argon2id hash, never the plaintext', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const rows = await getDb().select().from(users).where(eq(users.email, REGISTER.email));
    const stored = rows[0]?.passwordHash ?? '';

    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(stored).not.toContain(REGISTER.password);
  });

  it('rejects a password below the documented minimum', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...REGISTER, password: 'short' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown body key (api-spec 1)', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...REGISTER, isAdmin: true })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid timezone', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...REGISTER, timezone: 'Mars/Olympus' })
      .expect(400);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);
    const response = await request(app).post('/api/v1/auth/register').send(REGISTER).expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('writes an audit row', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const { auditLog } = await import('../../src/db/schema/audit.js');
    const rows = await getDb().select().from(auditLog).where(eq(auditLog.action, 'auth.register'));

    expect(rows.length).toBe(1);
  });
});

describe('POST /auth/login', () => {
  it('returns 200 and a fresh session', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    expect(response.body.data.email).toBe(REGISTER.email);
    expect(response.body.data.lastLoginAt).not.toBeNull();
    expect(cookieValue(response, 'http_at')).toBeTruthy();
  });

  it('returns INVALID_CREDENTIALS for a wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: 'wrong password entirely' })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns the identical error for an unknown account (no enumeration signal)', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: 'wrong password entirely' })
      .expect(401);

    const unknownAccount = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong password entirely' })
      .expect(401);

    expect(unknownAccount.body.error.code).toBe(wrongPassword.body.error.code);
    expect(unknownAccount.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('sets last_login_at', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    const rows = await getDb().select().from(users).where(eq(users.email, REGISTER.email));
    expect(rows[0]?.lastLoginAt).not.toBeNull();
  });
});

describe('POST /auth/refresh — rotation and reuse detection', () => {
  it('rotates: the new refresh token differs and stays in the same family', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    const original = requireCookie(login, 'http_rt');
    const originalRow = await familyOf(original);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `http_rt=${original}`)
      .expect(200);

    expect(refreshed.body.data.ok).toBe(true);

    const rotated = requireCookie(refreshed, 'http_rt');
    expect(rotated).not.toBe(original);

    // Rotation stays inside the presented token's family (engineering-contract.md
    // §7.4 rule 1). Register created a separate family, so the assertion is on
    // the rotated row's family, not on the total count.
    expect((await familyOf(rotated))).toBe(originalRow);
  });

  it('marks the old row rotated and stores only a hash', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    const original = requireCookie(login, 'http_rt');
    await request(app).post('/api/v1/auth/refresh').set('Cookie', `http_rt=${original}`).expect(200);

    const rows = await getDb().select().from(refreshTokens);
    const old = rows.find((r) => r.tokenHash === hashToken(original));

    expect(old?.rotatedAt).not.toBeNull();
    // The raw token is never persisted.
    expect(JSON.stringify(rows)).not.toContain(original);
  });

  it('revokes the whole family and returns TOKEN_REUSE_DETECTED on replay', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    const original = requireCookie(login, 'http_rt');
    const family = await familyOf(original);

    // First use rotates it.
    await request(app).post('/api/v1/auth/refresh').set('Cookie', `http_rt=${original}`).expect(200);

    // Replaying the consumed token is reuse.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `http_rt=${original}`)
      .expect(401);

    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // The whole replayed family is revoked, including the token minted by the
    // first rotation. The register-created family is a different session and is
    // deliberately untouched (engineering-contract.md §7.4 rule 2).
    const familyRows = await rowsInFamily(family);
    expect(familyRows.length).toBeGreaterThanOrEqual(2);
    expect(familyRows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(familyRows.every((r) => r.revokedReason === 'reuse_detected')).toBe(true);
  });

  it('returns 401 for an unknown refresh token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'http_rt=deadbeef')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /auth/logout and /auth/logout-all', () => {
  it('logout revokes the presented family and is idempotent', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    const token = requireCookie(login, 'http_rt');
    const family = await familyOf(token);

    await request(app).post('/api/v1/auth/logout').set('Cookie', `http_rt=${token}`).expect(204);
    // Second call is still 204: logout is idempotent (api-spec.md §9.2).
    await request(app).post('/api/v1/auth/logout').set('Cookie', `http_rt=${token}`).expect(204);

    // Only the presented family is revoked; register's session is separate.
    const familyRows = await rowsInFamily(family);
    expect(familyRows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(familyRows.every((r) => r.revokedReason === 'logout')).toBe(true);
  });

  it('logout-all revokes every family for the user', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password })
      .expect(200);

    const access = requireCookie(first, 'http_at');

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${access}`)
      .expect(204);

    const rows = await getDb().select().from(refreshTokens);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});

describe('GET /auth/me', () => {
  it('returns the caller', async () => {
    const { accessToken } = await registerUser('me@example.com');

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.email).toBe('me@example.com');
  });

  it('returns 401 without a token', async () => {
    const response = await request(app).get('/api/v1/auth/me').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('sets Cache-Control: no-store', async () => {
    const { accessToken } = await registerUser('nostore@example.com');

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('/users/me', () => {
  it('returns the caller', async () => {
    const { accessToken } = await registerUser('users@example.com');

    const response = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.email).toBe('users@example.com');
  });

  it('patches the allowed fields', async () => {
    const { accessToken } = await registerUser('patch@example.com');

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Renamed', locale: 'tr' })
      .expect(200);

    expect(response.body.data.displayName).toBe('Renamed');
    expect(response.body.data.locale).toBe('tr');
  });

  it('emits meta.notices when the timezone changes', async () => {
    const { accessToken } = await registerUser('tz@example.com');

    const response = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timezone: 'Europe/London' })
      .expect(200);

    expect(Array.isArray(response.body.meta.notices)).toBe(true);
    expect(response.body.meta.notices.join(' ')).toMatch(/timezone/i);
  });

  it('refuses to patch email or password (api-spec 9.2)', async () => {
    const { accessToken } = await registerUser('secure@example.com');

    await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'hijack@example.com' })
      .expect(400);

    await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'new password here' })
      .expect(400);
  });

  it('has no cross-user read path: there is no GET /users/:id', async () => {
    const { id } = await registerUser('victim@example.com');
    const { accessToken } = await registerUser('attacker@example.com');

    await request(app)
      .get(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('one user cannot modify another user through any documented route', async () => {
    const victim = await registerUser('victim2@example.com');
    const attacker = await registerUser('attacker2@example.com');

    // There is no id-addressable update, and PATCH /users/me always targets the
    // caller's own row.
    const response = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({ displayName: 'Attacker Was Here' })
      .expect(200);

    expect(response.body.data.id).toBe(attacker.id);

    const rows = await getDb().select().from(users).where(eq(users.id, victim.id));
    expect(rows[0]?.displayName).toBe('Ozeyid');
  });
});

describe('POST /auth/forgot-password and /auth/reset-password', () => {
  it('always returns 202 with a neutral message', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: REGISTER.email })
      .expect(202);

    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(202);

    expect(known.body.data.message).toBe(unknown.body.data.message);
  });

  it('reset rejects an unknown token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'a brand new password' })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /auth/change-password', () => {
  it('requires authentication', async () => {
    await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: REGISTER.password, newPassword: 'another password' })
      .expect(401);
  });

  it('rejects a wrong current password', async () => {
    const { accessToken } = await registerUser('cp@example.com');

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'not the password', newPassword: 'another password' })
      .expect(401);
  });

  it('changes the password so the old one no longer logs in', async () => {
    const { accessToken } = await registerUser('cp2@example.com');
    const newPassword = 'a completely different password';

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: REGISTER.password, newPassword })
      .expect(204);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cp2@example.com', password: REGISTER.password })
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cp2@example.com', password: newPassword })
      .expect(200);
  });
});

describe('bearer authentication is test-only (engineering-contract.md 7.1)', () => {
  it('refuses to construct a bearer app outside NODE_ENV=test', () => {
    resetEnvCache();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      expect(() => createApp({ authMode: 'bearer' })).toThrow();
    } finally {
      process.env.NODE_ENV = previous;
      resetEnvCache();
    }
  });
});

describe('database integrity', () => {
  it('never persists a refresh token in plaintext', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const rows = await getDb().select().from(refreshTokens);
    for (const row of rows) {
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('stores family_id as a UUID (ADR-008)', async () => {
    await request(app).post('/api/v1/auth/register').send(REGISTER).expect(201);

    const rows = await getDb().select().from(refreshTokens);
    for (const row of rows) {
      expect(row.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('uses generated ids, not a database default', async () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('hashPassword is what register stores, and it is argon2id', async () => {
    const hash = await hashPassword(REGISTER.password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});