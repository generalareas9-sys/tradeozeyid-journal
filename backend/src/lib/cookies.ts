import type { CookieOptions, Response } from 'express';
import { getEnv } from '../config/index.js';

/**
 * Session cookies (engineering-contract.md §7.2, §7.3; api-spec.md §2.1).
 *
 * The owner approved **same-origin production hosting** on 2026-10-03, so the
 * production row of the §7.2 table applies: `SameSite=Strict` for all three
 * cookies, `secure: true`, and `domain` left unset (host-only).
 *
 * Local development stays **cross-origin** (Vite on 5173, API on 3000 — a
 * different origin), so `SameSite=Lax` is required there for the browser to
 * send the cookies at all. `secure` is driven by `COOKIE_SECURE`, which defaults
 * to true and is relaxed to false only by an explicit `COOKIE_SECURE=false` in
 * `.env` (§7.2 "Development relaxation is explicit").
 *
 * api-spec.md §2.1 carries the same environment-scoped table, so both documents
 * agree on the values below.
 */

export const ACCESS_COOKIE = 'http_at';
export const REFRESH_COOKIE = 'http_rt';
export const CSRF_COOKIE = 'csrf_token';

/** §7.2: the refresh cookie is scoped so it is not attached to every call. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const ACCESS_COOKIE_PATH = '/api';
export const CSRF_COOKIE_PATH = '/';

/** §7.3 lifetimes. */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const CSRF_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** §9.2 / database-schema.md §3.2: a reset token is valid for 30 minutes. */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/**
 * `sameSite` and `secure` for the current environment.
 *
 * Production is `strict`/`true`. Development and test are `lax`, with `secure`
 * taken from `COOKIE_SECURE` so a developer can also run over plain HTTP.
 */
export function cookieSecurity(): { sameSite: 'strict' | 'lax'; secure: boolean } {
  const env = getEnv();

  if (env.NODE_ENV === 'production') {
    return { sameSite: 'strict', secure: true };
  }

  return { sameSite: 'lax', secure: env.COOKIE_SECURE };
}

function baseOptions(maxAgeMs: number, httpOnly: boolean): CookieOptions {
  const { sameSite, secure } = cookieSecurity();

  return {
    httpOnly,
    secure,
    sameSite,
    maxAge: maxAgeMs,
    // `domain` is deliberately never set: §7.2 forbids it on a public suffix and
    // host-only is correct for a single-origin deployment.
    path: '/',
  };
}

/**
 * Sets the access cookie. `httpOnly` so script cannot read the token
 * (§18: never expose tokens to the browser's storage).
 */
export function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, {
    ...baseOptions(ACCESS_TOKEN_MAX_AGE_MS, true),
    path: ACCESS_COOKIE_PATH,
  });
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(REFRESH_TOKEN_MAX_AGE_MS, true),
    path: REFRESH_COOKIE_PATH,
  });
}

/**
 * Sets the CSRF cookie. Deliberately **not** httpOnly: §7.5 double-submit
 * requires the browser's JavaScript to read this value and echo it in the
 * `X-CSRF-Token` header. It carries no authority on its own.
 */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    ...baseOptions(CSRF_TOKEN_MAX_AGE_MS, false),
    path: CSRF_COOKIE_PATH,
  });
}

/** Clears all three. Paths must match the set paths or the browser keeps them. */
export function clearSessionCookies(res: Response): void {
  const { sameSite, secure } = cookieSecurity();

  const clear = (name: string, path: string): void => {
    res.clearCookie(name, { httpOnly: name !== CSRF_COOKIE, secure, sameSite, path });
  };

  clear(ACCESS_COOKIE, ACCESS_COOKIE_PATH);
  clear(REFRESH_COOKIE, REFRESH_COOKIE_PATH);
  clear(CSRF_COOKIE, CSRF_COOKIE_PATH);
}

/**
 * `Cache-Control: no-store` on authenticated responses (api-spec.md §1, §7.10).
 */
export function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}