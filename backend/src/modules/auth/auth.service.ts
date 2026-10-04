import type { Request, Response } from 'express';
import type { UserResource } from '@tradeozeyid/contracts';
import {
  generateCsrfToken,
  generateToken,
  generateFamilyId,
  hashToken,
  signAccessToken,
} from '../../lib/crypto.js';
import { generateId } from '../../lib/ids.js';
import {
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
  setAccessCookie,
  setCsrfCookie,
  setRefreshCookie,
} from '../../lib/cookies.js';
import { ConflictError, InvalidCredentialsError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { PasswordPolicyError, hashPassword, performDummyVerify, verifyPassword } from '../../lib/password.js';
import { writeAudit } from '../audit/audit.service.js';
import { getEmailTransport } from '../email/email.transport.js';
import * as repo from './auth.repository.js';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.schema.js';

/**
 * Authentication (docs/phase-plan.md Phase 3; api-spec.md §9.2;
 * engineering-contract.md §7.1–§7.5).
 *
 * Rules held throughout this file:
 *  - the refresh token is opaque; only its SHA-256 hash is stored (§7.3);
 *  - rotation is one-way and reuse is fatal to the whole family (§7.4);
 *  - login failures are indistinguishable from an unknown account;
 *  - no password, hash, token or cookie value is ever logged or returned.
 */

/** Serialises a user row to the documented resource shape (api-spec.md §8). */
export function toUserResource(row: repo.UserRow): UserResource {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    timezone: row.timezone,
    baseCurrency: row.baseCurrency,
    locale: row.locale,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt ? row.emailVerifiedAt.toISOString() : null,
    defaultRiskPercent: Number(row.defaultRiskPercent),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface SessionPair {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

function clientMeta(req: Request): { userAgent: string | null; ip: string | null } {
  const ua = req.headers['user-agent'];
  return {
    userAgent: typeof ua === 'string' ? ua : null,
    ip: typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null,
  };
}

/**
 * Issues a brand-new session: a refresh-token family, a JWT access token and a
 * CSRF token. `familyId` is supplied when rotating inside an existing family.
 */
async function issueSession(
  userId: string,
  userAgent: string | null,
  ip: string | null,
  familyId?: string,
): Promise<SessionPair> {
  const now = new Date();

  const refreshToken = generateToken();
  const family = familyId ?? generateFamilyId();

  await repo.insertRefreshToken({
    id: generateId(),
    userId,
    familyId: family,
    tokenHash: hashToken(refreshToken),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_MAX_AGE_MS),
    userAgent,
    ip,
  });

  const accessToken = await signAccessToken(userId, generateId(), 'user');

  return { accessToken, refreshToken, csrfToken: generateCsrfToken() };
}

/** Writes the three cookies for a session, rotating the CSRF token (§2.2). */
export function applySession(res: Response, session: SessionPair): void {
  setAccessCookie(res, session.accessToken);
  setRefreshCookie(res, session.refreshToken);
  setCsrfCookie(res, session.csrfToken);
}

/**
 * Issues a CSRF token on its own (api-spec.md §2.2.1).
 *
 * Every other path that sets `csrf_token` goes through `applySession`, which only
 * runs after a successful register, login or refresh — all of them unsafe methods
 * that §2.2 already guards. Without this, a fresh browser has no way to obtain
 * its first token and could never sign in.
 *
 * No token family, no database write and no audit row: the CSRF token is not a
 * credential, it authorises nothing on its own, and there is no session to
 * attribute. An existing cookie is replaced rather than reused, so a client that
 * lost track of its token can always recover with a fresh one.
 */
export function issueCsrfToken(res: Response): string {
  const token = generateCsrfToken();

  setCsrfCookie(res, token);

  return token;
}

/** Maps an Argon2/breach policy failure onto the documented error envelope. */
function policyError(error: unknown, field: string): never {
  if (error instanceof PasswordPolicyError) {
    throw new ValidationError([{ path: field, message: error.message }]);
  }
  throw error;
}

/* ------------------------------------------------------------------ */
/* POST /auth/register                                                 */
/* ------------------------------------------------------------------ */

export async function register(
  input: RegisterInput,
  res: Response,
  req: Request,
): Promise<UserResource> {
  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError('An account with that email already exists');
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (error) {
    policyError(error, 'password');
  }

  const user = await repo.insertUser({
    id: generateId(),
    email: input.email,
    passwordHash,
    displayName: input.displayName,
    timezone: input.timezone,
    baseCurrency: input.baseCurrency,
  });

  const meta = clientMeta(req);
  applySession(res, await issueSession(user.id, meta.userAgent, meta.ip));

  await writeAudit({
    actorUserId: user.id,
    action: 'auth.register',
    entityType: 'user',
    entityId: user.id,
    req,
  });

  return toUserResource(user);
}

/* ------------------------------------------------------------------ */
/* POST /auth/login                                                    */
/* ------------------------------------------------------------------ */

export async function login(
  input: LoginInput,
  res: Response,
  req: Request,
): Promise<UserResource> {
  const user = await repo.findUserByEmail(input.email);

  if (!user) {
    // One real Argon2id verification either way, so an unknown email costs the
    // same as a wrong password (api-spec.md §9.2 forbids an enumeration signal).
    await performDummyVerify();
    await writeAudit({
      action: 'auth.login_failed',
      entityType: 'user',
      metadata: { reason: 'unknown_account' },
      req,
    });
    throw new InvalidCredentialsError();
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  if (!passwordOk || user.status !== 'active') {
    // A suspended account is reported exactly like a wrong password.
    await writeAudit({
      actorUserId: user.id,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: passwordOk ? 'inactive_account' : 'bad_password' },
      req,
    });
    throw new InvalidCredentialsError();
  }

  const now = new Date();
  await repo.touchLastLogin(user.id, now);

  const meta = clientMeta(req);
  applySession(res, await issueSession(user.id, meta.userAgent, meta.ip));

  await writeAudit({
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    req,
  });

  return { ...toUserResource(user), lastLoginAt: now.toISOString() };
}

/* ------------------------------------------------------------------ */
/* POST /auth/refresh — rotation and reuse detection                   */
/* ------------------------------------------------------------------ */

export type RefreshOutcome =
  | { ok: true; session: SessionPair }
  | { ok: false; reason: 'missing' | 'unknown' | 'expired' | 'reuse_detected' };

/**
 * The rotation state machine (engineering-contract.md §7.4, mirrored in
 * database-schema.md §3.3).
 *
 * 1. An **active** token rotates: its row gets `rotated_at` and a new token is
 *    issued in the **same** family.
 * 2. A token already carrying `rotated_at` or `revoked_at` means the raw value
 *    was replayed. The whole family is revoked with `reuse_detected` and the
 *    caller receives `401 TOKEN_REUSE_DETECTED`.
 * 3. Anything else (unknown digest, expired) is an ordinary failure.
 *
 * Step 1 is a conditional UPDATE, so two concurrent refreshes with the same
 * token cannot both win: exactly one observes `rotated_at IS NULL`. Losing that
 * race is treated as reuse, which is the safe reading.
 */
export async function rotateSession(
  presentedRefreshToken: string | undefined,
  req: Request,
): Promise<RefreshOutcome> {
  if (!presentedRefreshToken) {
    return { ok: false, reason: 'missing' };
  }

  const now = new Date();
  const record = await repo.findRefreshTokenByHash(hashToken(presentedRefreshToken));

  if (!record) {
    return { ok: false, reason: 'unknown' };
  }

  if (record.rotatedAt !== null || record.revokedAt !== null) {
    await repo.revokeFamily(record.familyId, 'reuse_detected', now);
    await writeAudit({
      actorUserId: record.userId,
      action: 'auth.token_reuse_detected',
      entityType: 'user',
      entityId: record.userId,
      metadata: { familyId: record.familyId },
      req,
    });
    return { ok: false, reason: 'reuse_detected' };
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  const marked = await repo.markRotated(record.id, now);
  if (!marked) {
    await repo.revokeFamily(record.familyId, 'reuse_detected', now);
    return { ok: false, reason: 'reuse_detected' };
  }

  const meta = clientMeta(req);
  return { ok: true, session: await issueSession(record.userId, meta.userAgent, meta.ip, record.familyId) };
}

/* ------------------------------------------------------------------ */
/* Logout                                                              */
/* ------------------------------------------------------------------ */

export async function logout(
  presentedRefreshToken: string | undefined,
  req: Request,
): Promise<void> {
  if (!presentedRefreshToken) return;

  const record = await repo.findRefreshTokenByHash(hashToken(presentedRefreshToken));
  if (!record) return;

  await repo.revokeFamily(record.familyId, 'logout', new Date());
  await writeAudit({
    actorUserId: record.userId,
    action: 'auth.logout',
    entityType: 'user',
    entityId: record.userId,
    metadata: { familyId: record.familyId },
    req,
  });
}

export async function logoutAll(userId: string, req: Request): Promise<void> {
  await repo.revokeAllForUser(userId, 'logout', new Date());
  await writeAudit({
    actorUserId: userId,
    action: 'auth.logout_all',
    entityType: 'user',
    entityId: userId,
    req,
  });
}

/* ------------------------------------------------------------------ */
/* Password reset and change                                           */
/* ------------------------------------------------------------------ */

export const NEUTRAL_RESET_MESSAGE =
  'If an account exists for that address, a password reset link has been sent.';

/** Always the same neutral outcome, whether or not the account exists. */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
  req: Request,
): Promise<string> {
  const user = await repo.findUserByEmail(input.email);

  if (user && user.status === 'active') {
    const now = new Date();
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

    await repo.insertPasswordResetToken({
      id: generateId(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    await getEmailTransport().sendPasswordReset({
      to: user.email,
      displayName: user.displayName,
      token,
      expiresAt,
    });

    await writeAudit({
      actorUserId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      req,
    });
  }

  return NEUTRAL_RESET_MESSAGE;
}

export async function resetPassword(input: ResetPasswordInput, req: Request): Promise<void> {
  const now = new Date();
  const record = await repo.findValidPasswordResetToken(hashToken(input.token), now);

  // Unknown, consumed and expired are indistinguishable.
  if (!record) {
    throw new NotFoundError('Reset token is invalid or has expired');
  }

  // Single-use: the conditional UPDATE means only one caller can consume it.
  if (!(await repo.consumePasswordResetToken(record.id, now))) {
    throw new NotFoundError('Reset token is invalid or has expired');
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (error) {
    policyError(error, 'password');
  }

  await repo.updatePasswordHash(record.userId, passwordHash);
  // §7.4: a password reset revokes every family.
  await repo.revokeAllForUser(record.userId, 'password_change', now);

  await writeAudit({
    actorUserId: record.userId,
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: record.userId,
    req,
  });
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  req: Request,
): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new InvalidCredentialsError();
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.newPassword);
  } catch (error) {
    policyError(error, 'newPassword');
  }

  const now = new Date();
  await repo.updatePasswordHash(userId, passwordHash);

  // api-spec.md §9.2: revoke every family EXCEPT the caller's, so the user
  // stays signed in on the device they changed the password from.
  const currentFamily = await familyIdForPresentedToken(
    userId,
    readRefreshCookie(req),
  );
  await repo.revokeAllForUser(userId, 'password_change', now, currentFamily);

  await writeAudit({
    actorUserId: userId,
    action: 'auth.password_change',
    entityType: 'user',
    entityId: userId,
    req,
  });
}

/* ------------------------------------------------------------------ */
/* GET /auth/me                                                        */
/* ------------------------------------------------------------------ */

/**
 * Resolves the caller's own user row.
 *
 * The lookup is scoped by `id` **and** `deleted_at IS NULL`
 * (engineering-contract.md §5.5), so a soft-deleted account cannot authenticate
 * even with a valid token.
 */
export async function findUserForRequest(userId: string): Promise<UserResource> {
  const user = await repo.findUserById(userId);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return toUserResource(user);
}

/* ------------------------------------------------------------------ */
/* Helpers shared with the routes                                      */
/* ------------------------------------------------------------------ */

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.http_rt;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The caller's active family, so `change-password` can spare it. */
export async function familyIdForPresentedToken(
  userId: string,
  presentedRefreshToken: string | undefined,
): Promise<string | undefined> {
  if (!presentedRefreshToken) return undefined;

  const record = await repo.findRefreshTokenByHash(hashToken(presentedRefreshToken));
  if (!record || record.userId !== userId) return undefined;

  return record.familyId;
}