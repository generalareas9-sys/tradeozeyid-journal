import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken } from '../lib/crypto.js';
import { getEnv } from '../config/index.js';
import { UnauthenticatedError, TokenExpiredError, ForbiddenError } from '../lib/errors.js';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    sessionId: string;
    role: string;
    jti: string;
  };
  authMode: 'cookie' | 'bearer';
}

/**
 * Resolves the caller from the `Authorization: Bearer` header (test-only) or the
 * `http_at` cookie. Throws on any failure.
 *
 * Split out from {@link authMiddleware} because Express 4 does **not** catch a
 * rejected promise from middleware: an `async` middleware that throws produces
 * an unhandled rejection and the request never receives a response. The exported
 * middleware below is synchronous and forwards failures to `next(err)`.
 */
async function resolveAuthenticatedUser(req: Request): Promise<AuthenticatedRequest['user']> {
  const env = getEnv();

  const authHeader = req.headers.authorization;
  const bearerToken = extractBearerToken(authHeader);
  const cookieToken = req.cookies?.http_at;

  let token: string | null = null;

  if (bearerToken !== null) {
    // engineering-contract.md §7.1: bearer is accepted ONLY in NODE_ENV=test and
    // only with ALLOW_TEST_BEARER, which app.ts already enforces at construction.
    if (env.NODE_ENV !== 'test' || !env.ALLOW_TEST_BEARER) {
      throw new UnauthenticatedError('Bearer authentication not allowed in this environment');
    }

    token = bearerToken;
  } else if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    token = cookieToken;
  }

  if (token === null) {
    throw new UnauthenticatedError();
  }

  try {
    const payload = await verifyAccessToken(token);

    return {
      id: payload.sub,
      sessionId: payload.sid,
      role: payload.role,
      jti: payload.jti,
    };
  } catch (error) {
    if (error instanceof Error && /expired/i.test(error.message)) {
      throw new TokenExpiredError();
    }
    throw new UnauthenticatedError('Invalid access token');
  }
}

/**
 * Requires a valid session.
 *
 * Synchronous on purpose: see {@link resolveAuthenticatedUser}. Failures are
 * forwarded to `next(err)` so the error middleware renders the documented
 * envelope instead of the request hanging.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  authReq.authMode = req.headers.authorization?.startsWith('Bearer ') ? 'bearer' : 'cookie';

  resolveAuthenticatedUser(req)
    .then((user) => {
      authReq.user = user;
      next();
    })
    .catch(next);
}

/**
 * Attaches the user when a valid session is present, and otherwise continues
 * anonymously.
 *
 * The rejection must be handled with `.catch`, not a synchronous `try/catch`:
 * `authMiddleware` is `async`, so its failures arrive as a rejected promise that
 * a `try` block cannot observe. An earlier revision of this function used
 * `try/catch`, which silently did nothing and surfaced auth failures as
 * unhandled rejections.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  resolveAuthenticatedUser(req)
    .then((user) => {
      const authReq = req as AuthenticatedRequest;
      authReq.user = user;
      authReq.authMode = req.headers.authorization?.startsWith('Bearer ') ? 'bearer' : 'cookie';
      next();
    })
    .catch(() => {
      next();
    });
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthenticatedError();
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    next();
  };
}