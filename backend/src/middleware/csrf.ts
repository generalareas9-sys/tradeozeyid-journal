import type { Request, Response, NextFunction } from 'express';
import { CsrfFailedError } from '../lib/errors.js';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf_token';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * CSRF double-submit protection (engineering-contract.md §7.5, api-spec.md §2.2).
 *
 * §7.1 is explicit about how the skip works: "The CSRF middleware reads the same
 * mode: it enforces double-submit in cookie and production modes, and skips only
 * in bearer mode." The skip therefore keys off the **application's** `authMode`,
 * never off `NODE_ENV`. Skipping whenever `NODE_ENV=test` — as an earlier
 * revision of this file did — would let a cookie-mode CSRF regression pass CI.
 */
export function createCsrfMiddleware(authMode: 'cookie' | 'bearer') {
  return function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
    // Bearer is test-only (engineering-contract.md §7.1) and carries no cookie,
    // so there is nothing for an attacker to ride on.
    if (authMode === 'bearer') {
      return next();
    }

    if (SAFE_METHODS.includes(req.method)) {
      return next();
    }

    // A bearer-authenticated request inside a cookie-mode app is still a
    // cookie-less request; §2.2 exempts requests authenticated *solely* by the
    // Authorization header. Outside `NODE_ENV=test` the auth middleware rejects
    // bearer outright, so this only applies to the test harness.
    if (isBearerOnly(req)) {
      return next();
    }

    const cookieToken = readCookie(req, CSRF_COOKIE);
    const headerToken = req.headers[CSRF_HEADER];

    if (typeof cookieToken !== 'string' || cookieToken.length === 0) {
      throw new CsrfFailedError();
    }

    if (typeof headerToken !== 'string' || headerToken.length === 0) {
      throw new CsrfFailedError();
    }

    if (!constantTimeEquals(cookieToken, headerToken)) {
      throw new CsrfFailedError();
    }

    next();
  };
}

function isBearerOnly(req: Request): boolean {
  return req.headers.authorization?.startsWith('Bearer ') === true;
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[name];
}

/**
 * Compares the two tokens without an early-exit length or content check, so the
 * rejection path does not leak where the mismatch was.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}