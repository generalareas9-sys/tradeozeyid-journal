import type { Request, Response, NextFunction } from 'express';
import { RateLimitedError } from '../lib/errors.js';

/**
 * Rate limiting (engineering-contract.md §7.9).
 *
 * §7.9 requires "per-IP **and** per-user on `auth` endpoints". A single
 * limiter keyed on one dimension does not satisfy that: keying only on the
 * submitted email lets one IP lock a victim's account out, and keying only on the
 * IP lets one account be attacked from many addresses. The auth limiters below
 * are therefore applied in pairs, one per dimension.
 *
 * The store is in-process, which is correct for the single-instance MVP under
 * ADR-012 (no Redis). Entries are swept lazily so a long-running process cannot
 * grow the map without bound.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/** Sweep when the store grows past this, to bound memory in a long process. */
const SWEEP_THRESHOLD = 10_000;

function getStore(key: string): Map<string, RateLimitEntry> {
  let store = stores.get(key);

  if (!store) {
    store = new Map();
    stores.set(key, store);
  }

  return store;
}

function sweep(store: Map<string, RateLimitEntry>, now: number): void {
  if (store.size < SWEEP_THRESHOLD) return;

  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/** Clears every counter. Test isolation only. */
export function resetRateLimitStores(): void {
  stores.clear();
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  /** Defaults to the client IP. */
  keyGenerator?: (req: Request) => string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix, keyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const store = getStore(keyPrefix);
    const now = Date.now();
    sweep(store, now);

    const key = keyPrefix + ':' + (keyGenerator ? keyGenerator(req) : req.ip || 'unknown');

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (entry.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      throw new RateLimitedError(retryAfter);
    }

    next();
  };
}

function submittedEmail(req: Request): string {
  const body = req.body as Record<string, unknown> | undefined;
  const email = body?.email;

  return typeof email === 'string' && email.length > 0
    ? email.trim().toLowerCase()
    : 'anonymous';
}

/**
 * Login: 10 per 15 minutes, enforced on **both** dimensions.
 *
 * `loginRateLimiter` throttles by client IP; `loginAccountRateLimiter` throttles
 * by the submitted account so one account cannot be sprayed from many IPs.
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'auth:login:ip',
});

export const loginAccountRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'auth:login:account',
  keyGenerator: submittedEmail,
});

/** Register: 5 per hour per IP (§7.9). */
export const registerRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyPrefix: 'auth:register',
});

/**
 * Forgot password: 3 per hour (api-spec.md §9.2). Keyed on the submitted email
 * as well as the IP so one address cannot be used to enumerate or flood.
 */
export const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  keyPrefix: 'auth:forgot-password',
  keyGenerator: submittedEmail,
});

/**
 * Reset password: 5 per hour (api-spec.md §9.2, matching engineering-contract.md
 * §7.9, which carries the same split: forgot-password 3/hour, reset-password
 * 5/hour).
 */
export const resetPasswordRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyPrefix: 'auth:reset-password',
});

/**
 * CSRF bootstrap: 60 per minute per IP (api-spec.md §2.2.1).
 *
 * `GET /auth/csrf` hands out a fresh token to anyone who asks, so it is limited
 * per IP purely to stop it being driven as a token oracle. It is far above the
 * real rate: the client calls it once per page load, and only again when the
 * cookie is absent.
 */
export const csrfRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'auth:csrf',
});

/** Global: 300 per minute per IP (§7.9). */
export const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'global',
});