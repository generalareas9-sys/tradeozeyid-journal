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

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const env = getEnv();
  const authReq = req as AuthenticatedRequest;

  const authHeader = req.headers.authorization;
  const hasBearer = authHeader?.startsWith('Bearer ');
  const hasCookie = req.cookies?.http_at;

  if (hasBearer) {
    if (env.NODE_ENV !== 'test') {
      throw new UnauthenticatedError('Bearer authentication not allowed in this environment');
    }

    if (!env.ALLOW_TEST_BEARER) {
      throw new UnauthenticatedError('Bearer authentication not enabled');
    }

    authReq.authMode = 'bearer';
    const token = extractBearerToken(authHeader);
    if (!token) {
      throw new UnauthenticatedError('Missing bearer token');
    }

    try {
      const payload = await verifyAccessToken(token);
      authReq.user = {
        id: payload.sub,
        sessionId: payload.sid,
        role: payload.role,
        jti: payload.jti,
      };
      next();
    } catch (error) {
      if (error instanceof Error && error.message.includes('expired')) {
        throw new TokenExpiredError();
      }
      throw new UnauthenticatedError('Invalid access token');
    }
  } else if (hasCookie) {
    authReq.authMode = 'cookie';
    const token = req.cookies?.http_at;
    if (!token) {
      throw new UnauthenticatedError('Missing access token cookie');
    }

    try {
      const payload = await verifyAccessToken(token);
      authReq.user = {
        id: payload.sub,
        sessionId: payload.sid,
        role: payload.role,
        jti: payload.jti,
      };
      next();
    } catch (error) {
      if (error instanceof Error && error.message.includes('expired')) {
        throw new TokenExpiredError();
      }
      throw new UnauthenticatedError('Invalid access token');
    }
  } else {
    throw new UnauthenticatedError();
  }
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    authMiddleware(req, res, next);
  } catch {
    next();
  }
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