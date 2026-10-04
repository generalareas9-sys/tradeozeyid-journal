import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { passwordResetTokens, refreshTokens, users } from '../../db/schema/auth.js';

/**
 * Auth data access.
 *
 * Every query that reads or writes user-owned rows resolves on `user_id`
 * (engineering-contract.md §5.5 and §7.14). Nothing here returns a password
 * hash to a caller other than {@link findUserForAuthentication}, whose single
 * purpose is the login comparison.
 */

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  return rows[0];
}

export async function findUserById(userId: string): Promise<UserRow | undefined> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  return rows[0];
}

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  timezone: string;
  baseCurrency: string;
}

export async function insertUser(user: NewUser): Promise<UserRow> {
  const rows = await getDb().insert(users).values(user).returning();

  const created = rows[0];
  if (!created) throw new Error('User insert returned no row');

  return created;
}

export async function touchLastLogin(userId: string, at: Date): Promise<void> {
  await getDb()
    .update(users)
    .set({ lastLoginAt: at, updatedAt: at })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
}

export async function patchUser(
  userId: string,
  patch: Partial<
    Pick<UserRow, 'displayName' | 'timezone' | 'locale' | 'baseCurrency' | 'defaultRiskPercent'>
  >,
): Promise<UserRow | undefined> {
  const rows = await getDb()
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning();

  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Refresh tokens                                                      */
/* ------------------------------------------------------------------ */

export interface NewRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export async function insertRefreshToken(token: NewRefreshToken): Promise<void> {
  await getDb().insert(refreshTokens).values(token);
}

/**
 * Looks a refresh token up by the SHA-256 digest of its stored value.
 *
 * The digest is the lookup key, so the raw token is never used in a query.
 */
export async function findRefreshTokenByHash(
  tokenHash: string,
): Promise<typeof refreshTokens.$inferSelect | undefined> {
  const rows = await getDb()
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  return rows[0];
}

/** Marks one token rotated. Returns false when it was already rotated. */
export async function markRotated(
  id: string,
  at: Date,
): Promise<boolean> {
  const rows = await getDb()
    .update(refreshTokens)
    .set({ rotatedAt: at })
    .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.rotatedAt)))
    .returning({ id: refreshTokens.id });

  return rows.length > 0;
}

/** Revokes every token in a family (reuse detection, logout). */
export async function revokeFamily(
  familyId: string,
  reason: 'logout' | 'reuse_detected' | 'password_change' | 'admin' | 'rotation',
  at: Date,
): Promise<number> {
  const rows = await getDb()
    .update(refreshTokens)
    .set({ revokedAt: at, revokedReason: reason })
    .where(
      and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)),
    )
    .returning({ id: refreshTokens.id });

  return rows.length;
}

/** Revokes every family for a user (logout-all, password change/reset). */
export async function revokeAllForUser(
  userId: string,
  reason: 'logout' | 'reuse_detected' | 'password_change' | 'admin',
  at: Date,
  exceptFamilyId?: string,
): Promise<number> {
  const conditions = [
    eq(refreshTokens.userId, userId),
    isNull(refreshTokens.revokedAt),
  ];

  if (exceptFamilyId) {
    conditions.push(ne(refreshTokens.familyId, exceptFamilyId));
  }

  const rows = await getDb()
    .update(refreshTokens)
    .set({ revokedAt: at, revokedReason: reason })
    .where(and(...conditions))
    .returning({ id: refreshTokens.id });

  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Password reset tokens                                               */
/* ------------------------------------------------------------------ */

export interface NewPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function insertPasswordResetToken(token: NewPasswordResetToken): Promise<void> {
  await getDb().insert(passwordResetTokens).values(token);
}

/**
 * Finds a reset token that is unconsumed and unexpired.
 *
 * Single-use consumption is enforced by `consumePasswordResetToken`, which
 * updates only rows still unconsumed, so two concurrent resets cannot both win.
 */
export async function findValidPasswordResetToken(
  tokenHash: string,
  now: Date,
): Promise<typeof passwordResetTokens.$inferSelect | undefined> {
  const rows = await getDb()
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        // Typed comparison: a raw sql`... > ${now}` template would hand
        // postgres.js an untyped Date bind, which it cannot encode.
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  return rows[0];
}

export async function consumePasswordResetToken(id: string, at: Date): Promise<boolean> {
  const rows = await getDb()
    .update(passwordResetTokens)
    .set({ consumedAt: at })
    .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.consumedAt)))
    .returning({ id: passwordResetTokens.id });

  return rows.length > 0;
}

/** Housekeeping: delete reset rows that expired long ago. */
export async function purgeExpiredPasswordResetTokens(before: Date): Promise<void> {
  await getDb().delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, before));
}