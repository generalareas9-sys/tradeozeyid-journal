import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { closeDb, getDb } from '../../src/db/index.js';
import { auditLog } from '../../src/db/schema/audit.js';
import { passwordResetTokens, refreshTokens, users } from '../../src/db/schema/auth.js';
import { hashToken, generateToken } from '../../src/lib/crypto.js';
import { generateId } from '../../src/lib/ids.js';
import { hashPassword } from '../../src/lib/password.js';
import * as repo from '../../src/modules/auth/auth.repository.js';
import { rotateSession } from '../../src/modules/auth/auth.service.js';

/**
 * The refresh rotation state machine (engineering-contract.md §7.4, mirrored in
 * database-schema.md §3.3).
 *
 * `rotateSession` is exercised directly, against the **real** database rather than
 * a stubbed repository (AGENTS.md §2.9), because the guarantees under test are
 * themselves database guarantees: the conditional `markRotated` update and the
 * family-wide `revokeFamily` sweep. Mocking those away would test nothing.
 */

const PASSWORD = 'correct horse battery';

/** The service only reads `ip` and `user-agent` off the request. */
function fakeRequest(): Request {
  return {
    ip: '198.51.100.7',
    headers: { 'user-agent': 'rotation-state-machine-test' },
  } as unknown as Request;
}

async function truncateAuthTables(): Promise<void> {
  const db = getDb();
  await db.delete(auditLog);
  await db.delete(passwordResetTokens);
  await db.delete(refreshTokens);
  await db.delete(users);
}

/** A user with one active refresh token in a fresh family. */
async function seedUser(): Promise<{ userId: string; familyId: string; token: string }> {
  const user = await repo.insertUser({
    id: generateId(),
    email: `rotation-${generateId()}@example.com`,
    passwordHash: await hashPassword(PASSWORD),
    displayName: 'Rotation Tester',
    timezone: 'UTC',
    baseCurrency: 'USD',
  });

  const familyId = generateId();
  const token = generateToken();
  const now = new Date();

  await repo.insertRefreshToken({
    id: generateId(),
    userId: user.id,
    familyId,
    tokenHash: hashToken(token),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    userAgent: 'rotation-state-machine-test',
    ip: '198.51.100.7',
  });

  return { userId: user.id, familyId, token };
}

/** An extra, independent family for an existing user, as a second device would create. */
async function seedSecondFamily(userId: string): Promise<{ familyId: string; token: string }> {
  const familyId = generateId();
  const token = generateToken();
  const now = new Date();

  await repo.insertRefreshToken({
    id: generateId(),
    userId,
    familyId,
    tokenHash: hashToken(token),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    userAgent: 'rotation-state-machine-test',
    ip: '198.51.100.7',
  });

  return { familyId, token };
}

async function rowFor(token: string) {
  const rows = await getDb()
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)));

  return rows[0];
}

async function familyRows(familyId: string) {
  return getDb().select().from(refreshTokens).where(eq(refreshTokens.familyId, familyId));
}

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await truncateAuthTables();
});

describe('rotateSession — the refusal branches', () => {
  it('reports "missing" when no token is presented', async () => {
    expect(await rotateSession(undefined, fakeRequest())).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('reports "unknown" for a token that was never stored', async () => {
    expect(await rotateSession(generateToken(), fakeRequest())).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('reports "expired" for a stored token whose lifetime has passed', async () => {
    const user = await repo.insertUser({
      id: generateId(),
      email: `expired-${generateId()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      displayName: 'Expiry Tester',
      timezone: 'UTC',
      baseCurrency: 'USD',
    });

    const token = generateToken();
    const now = new Date();

    await repo.insertRefreshToken({
      id: generateId(),
      userId: user.id,
      familyId: generateId(),
      tokenHash: hashToken(token),
      issuedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      userAgent: null,
      ip: null,
    });

    expect(await rotateSession(token, fakeRequest())).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('rotateSession — the rotation branch', () => {
  it('issues a different token in the same family', async () => {
    const { userId, familyId, token } = await seedUser();

    const outcome = await rotateSession(token, fakeRequest());

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('expected a successful rotation');

    expect(outcome.session.refreshToken).not.toBe(token);
    expect(hashToken(outcome.session.refreshToken)).not.toBe(hashToken(token));

    // Same family: this is a rotation, not a new session.
    const replacement = await rowFor(outcome.session.refreshToken);
    expect(replacement?.familyId).toBe(familyId);
    expect(replacement?.userId).toBe(userId);
  });

  it('marks the presented token rotated and stores only its digest', async () => {
    const { token } = await seedUser();

    await rotateSession(token, fakeRequest());

    const original = await rowFor(token);
    expect(original?.rotatedAt).not.toBeNull();
    expect(original?.revokedAt).toBeNull();

    // The raw value must not appear anywhere in the row.
    expect(JSON.stringify(original)).not.toContain(token);
  });

  it('rotates again on the second use, keeping one family', async () => {
    const { familyId, token } = await seedUser();

    const first = await rotateSession(token, fakeRequest());
    if (!first.ok) throw new Error('expected a successful rotation');

    const second = await rotateSession(first.session.refreshToken, fakeRequest());
    if (!second.ok) throw new Error('expected a second successful rotation');

    expect(second.session.refreshToken).not.toBe(first.session.refreshToken);

    const rows = await familyRows(familyId);
    expect(rows).toHaveLength(3);

    // Exactly one row is still usable at any point in the chain.
    const active = rows.filter((row) => row.rotatedAt === null && row.revokedAt === null);
    expect(active).toHaveLength(1);
  });
});

describe('rotateSession — reuse detection', () => {
  it('refuses a replayed token as reuse and kills the family', async () => {
    const { familyId, token } = await seedUser();

    const first = await rotateSession(token, fakeRequest());
    if (!first.ok) throw new Error('expected a successful rotation');

    // The client presents the old value again — a stolen cookie being replayed.
    const replay = await rotateSession(token, fakeRequest());
    expect(replay).toEqual({ ok: false, reason: 'reuse_detected' });

    // The whole family is revoked, including the token the legitimate client holds.
    const rows = await familyRows(familyId);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    expect(rows.every((row) => row.revokedReason === 'reuse_detected')).toBe(true);

    // So the legitimate client's next rotation fails too.
    const aftermath = await rotateSession(first.session.refreshToken, fakeRequest());
    expect(aftermath).toEqual({ ok: false, reason: 'reuse_detected' });
  });

  it('treats an already-revoked token as reuse', async () => {
    const { familyId, token } = await seedUser();

    await repo.revokeFamily(familyId, 'logout', new Date());

    expect(await rotateSession(token, fakeRequest())).toEqual({
      ok: false,
      reason: 'reuse_detected',
    });
  });

  it('revokes only the offending family, leaving the same user other devices alone', async () => {
    const { userId, familyId, token } = await seedUser();
    const otherDevice = await seedSecondFamily(userId);

    const first = await rotateSession(token, fakeRequest());
    if (!first.ok) throw new Error('expected a successful rotation');

    await rotateSession(token, fakeRequest()); // the replay that trips reuse detection

    // The compromised family is dead.
    const compromised = await familyRows(familyId);
    expect(compromised.every((row) => row.revokedAt !== null)).toBe(true);

    // The user's other device keeps working, which is the whole point of keying
    // the sweep on `family_id` rather than on `user_id`.
    const surviving = await familyRows(otherDevice.familyId);
    expect(surviving.some((row) => row.revokedAt === null)).toBe(true);

    const stillValid = await rotateSession(otherDevice.token, fakeRequest());
    expect(stillValid.ok).toBe(true);
  });

  it('records an audit row naming reuse', async () => {
    const { token } = await seedUser();

    await rotateSession(token, fakeRequest());
    await rotateSession(token, fakeRequest());

    const rows = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'auth.token_reuse_detected'));

    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
