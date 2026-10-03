import { Request, Response, NextFunction } from 'express';
import { CsrfFailedError } from '../lib/errors.js';
import { getEnv } from '../config/index.js';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf_token';

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const env = getEnv();

  if (env.NODE_ENV === 'test') {
    return next();
  }

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    throw new CsrfFailedError();
  }

  if (cookieToken !== headerToken) {
    throw new CsrfFailedError();
  }

  next();
}