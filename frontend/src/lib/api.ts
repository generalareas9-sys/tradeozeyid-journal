import type { ApiErrorResponse } from '@tradeozeyid/contracts';

/**
 * The single HTTP client (engineering-contract.md §8: "Server state lives in one
 * cache layer"; api-spec.md §1).
 *
 * Security rules enforced here:
 *  - **No token is ever read or written by JavaScript.** The access and refresh
 *    tokens are `httpOnly`, so the browser attaches them and the page cannot see
 *    them. Nothing is put in `localStorage` or `sessionStorage`.
 *  - Every request sends `credentials: 'include'` so the cookies travel.
 *  - Mutations echo the `csrf_token` cookie in `X-CSRF-Token` (§7.5). That one
 *    cookie is deliberately readable by script.
 */

export const API_BASE_URL = '/api/v1';

export interface ValidationDetail {
  path: string;
  message: string;
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: ValidationDetail[] | undefined;

  constructor(
    status: number,
    body: ApiErrorResponse | null,
    fallbackMessage: string,
  ) {
    super(body?.error?.message ?? fallbackMessage);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.requestId = body?.meta?.requestId;
    const raw = (body?.error as { details?: ValidationDetail[] } | undefined)?.details;
    this.details = Array.isArray(raw) ? raw : undefined;
  }

  /** Field-level messages for form rendering. */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};

    for (const detail of this.details ?? []) {
      if (!result[detail.path]) {
        result[detail.path] = detail.message;
      }
    }

    return result;
  }
}

/** Reads the CSRF cookie. It is intentionally not `httpOnly` (§7.5). */
export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** De-duplicates concurrent bootstrap calls, the same way `refreshInFlight` does. */
let csrfBootstrap: Promise<string | null> | null = null;

/**
 * Returns the CSRF token, fetching one if the cookie is missing.
 *
 * `GET /auth/csrf` (api-spec.md §2.2.1) is the only documented way to obtain a
 * token before signing in: every endpoint that sets `csrf_token` is itself a
 * guarded unsafe method. This is called lazily, immediately before the first
 * unsafe request, rather than on page load, so a visitor who only reads pays
 * nothing.
 *
 * A failure resolves to `null` rather than throwing. The caller's request then
 * goes out without the header and the server answers `403 CSRF_FAILED`, which is
 * a clearer failure than a bootstrap error masking the real one.
 */
export async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCsrfToken();
  if (existing) return existing;

  if (!csrfBootstrap) {
    csrfBootstrap = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) return null;

        const parsed = (await response.json()) as { data?: { csrfToken?: string } };

        return parsed?.data?.csrfToken ?? null;
      } catch {
        return null;
      } finally {
        csrfBootstrap = null;
      }
    })();
  }

  return csrfBootstrap;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set false for the refresh call itself, to stop a refresh loop. */
  allowRefresh?: boolean;
  signal?: AbortSignal;
}

/**
 * A single in-flight refresh, shared by every caller that hits a 401 at the same
 * moment. Without this, five parallel requests would fire five refreshes; all but
 * the first would be reuse and would revoke the family (§7.4).
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const csrf = await ensureCsrfToken();
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers share one attempt.
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (MUTATING_METHODS.has(method)) {
    // Refresh is an unsafe method too, so it needs the token on the same terms.
    const csrf = await ensureCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      parsed as ApiErrorResponse | null,
      response.statusText,
    );
  }

  return (parsed as { data: T }).data;
}

/**
 * Issues an API request and unwraps the documented success envelope.
 *
 * On `401 UNAUTHENTICATED` / `401 TOKEN_EXPIRED` it performs **one** silent
 * refresh and replays the request once (api-spec.md §2.3). If the refresh fails
 * the original error is rethrown so the caller can send the user to login.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await send<T>(path, options);
  } catch (error) {
    const canRetry =
      error instanceof ApiRequestError &&
      (error.code === 'UNAUTHENTICATED' || error.code === 'TOKEN_EXPIRED') &&
      options.allowRefresh !== false &&
      (options.method ?? 'GET') === 'GET';

    if (!canRetry) {
      throw error;
    }

    const refreshed = await refreshSession();
    if (!refreshed) {
      throw error;
    }

    return send<T>(path, options);
  }
}

/** GET helper retained for existing callers such as the health feature. */
export async function getJson<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body });
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body });
}