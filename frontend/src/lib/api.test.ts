import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, API_BASE_URL, ensureCsrfToken, getJson, postJson, readCsrfToken } from './api';

/**
 * The HTTP client (engineering-contract.md §7.5, §18; api-spec.md §1, §2.3).
 *
 * Two properties matter more than anything else here and are asserted directly:
 *  - **no token is ever readable or stored by JavaScript** (no localStorage, no
 *    sessionStorage, no Authorization header built from state);
 *  - a `401` triggers **exactly one** silent refresh, and concurrent callers share
 *    that single attempt rather than firing one each.
 */

const RID = '0f9c1f2e-7d0b-4a52-9c9f-1c2e3f4a5b6c';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
  meta: { requestId: RID },
};

const TOKEN_EXPIRED = {
  error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
  meta: { requestId: RID },
};

function callsTo(fetchMock: ReturnType<typeof vi.fn>, url: string): unknown[][] {
  return fetchMock.mock.calls.filter((call) => String(call[0]) === url);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('request construction', () => {
  it('sends cookies with every request and never sets an Authorization header', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await getJson('/health');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('unwraps the success envelope', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { id: 'abc' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getJson('/anything')).toEqual({ id: 'abc' });
  });

  it('returns undefined for a 204 without parsing a body', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: () => Promise.reject(new Error('a 204 has no body')),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await postJson('/auth/logout')).toBeUndefined();
  });

  it('echoes the CSRF cookie on a mutation and omits it on a read', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'csrf_token=the-csrf-value; path=/';

    await postJson('/auth/login', { email: 'a@b.co' });
    await getJson('/auth/me');

    const post = fetchMock.mock.calls[0][1] as RequestInit;
    const get = fetchMock.mock.calls[1][1] as RequestInit;

    expect((post.headers as Record<string, string>)['X-CSRF-Token']).toBe('the-csrf-value');
    expect((get.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });

  it('raises a typed error carrying the code, status and request id', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ path: 'email', message: 'Enter a valid email address' }],
      },
      meta: { requestId: RID },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await getJson('/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    const typed = error as ApiRequestError;
    expect(typed.code).toBe('VALIDATION_ERROR');
    expect(typed.status).toBe(400);
    expect(typed.requestId).toBe(RID);
    expect(typed.fieldErrors()).toEqual({ email: 'Enter a valid email address' });
  });
});

describe('silent refresh', () => {
  it('refreshes once on UNAUTHENTICATED and replays the request', async () => {
    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === `${API_BASE_URL}/auth/refresh`) {
        return Promise.resolve(jsonResponse(200, { data: { ok: true } }));
      }

      // The protected resource answers 401 first, then succeeds after the refresh.
      const attempts = callsTo(fetchMock, `${API_BASE_URL}/protected`).length;
      return Promise.resolve(
        attempts === 1 ? jsonResponse(401, UNAUTHENTICATED) : jsonResponse(200, { data: { ok: 1 } }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await getJson('/protected')).toEqual({ ok: 1 });
    expect(callsTo(fetchMock, `${API_BASE_URL}/auth/refresh`)).toHaveLength(1);
    expect(callsTo(fetchMock, `${API_BASE_URL}/protected`)).toHaveLength(2);
  });

  it('refreshes once on TOKEN_EXPIRED too', async () => {
    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === `${API_BASE_URL}/auth/refresh`) {
        return Promise.resolve(jsonResponse(200, { data: { ok: true } }));
      }

      const attempts = callsTo(fetchMock, `${API_BASE_URL}/protected`).length;
      return Promise.resolve(
        attempts === 1 ? jsonResponse(401, TOKEN_EXPIRED) : jsonResponse(200, { data: 'fine' }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await getJson('/protected')).toBe('fine');
  });

  it('rethrows the original error when the refresh fails', async () => {
    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === `${API_BASE_URL}/auth/refresh`) {
        return Promise.resolve(jsonResponse(401, UNAUTHENTICATED));
      }

      return Promise.resolve(jsonResponse(401, UNAUTHENTICATED));
    });
    vi.stubGlobal('fetch', fetchMock);

    const error = await getJson('/protected').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(401);
    // One attempt, not an endless refresh/retry loop.
    expect(callsTo(fetchMock, `${API_BASE_URL}/auth/refresh`)).toHaveLength(1);
    expect(callsTo(fetchMock, `${API_BASE_URL}/protected`)).toHaveLength(1);
  });

  it('does not retry when the failure is not an authentication failure', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, {
      error: { code: 'CSRF_FAILED', message: 'CSRF token missing or invalid' },
      meta: { requestId: RID },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getJson('/protected')).rejects.toBeInstanceOf(ApiRequestError);
    expect(callsTo(fetchMock, `${API_BASE_URL}/auth/refresh`)).toHaveLength(0);
    expect(callsTo(fetchMock, `${API_BASE_URL}/protected`)).toHaveLength(1);
  });

  it('never refreshes in response to a mutation, so a POST cannot loop', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, UNAUTHENTICATED));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postJson('/anything', {})).rejects.toBeInstanceOf(ApiRequestError);
    expect(callsTo(fetchMock, `${API_BASE_URL}/auth/refresh`)).toHaveLength(0);
  });

  it('shares one refresh between concurrent callers', async () => {
    let refreshCalls = 0;

    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === `${API_BASE_URL}/auth/refresh`) {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse(200, { data: { ok: true } }));
      }

      const attempts = callsTo(fetchMock, `${url}`).length;
      return Promise.resolve(
        attempts === 1 ? jsonResponse(401, UNAUTHENTICATED) : jsonResponse(200, { data: url }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // Five requests hit a 401 at the same moment. If each fired its own refresh,
    // four would be reuse and would revoke the whole family (§7.4).
    const results = await Promise.all([
      getJson('/one'),
      getJson('/two'),
      getJson('/three'),
      getJson('/four'),
      getJson('/five'),
    ]);

    expect(results).toEqual([
      '/api/v1/one',
      '/api/v1/two',
      '/api/v1/three',
      '/api/v1/four',
      '/api/v1/five',
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('lets a later request refresh again after the shared attempt has settled', async () => {
    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === `${API_BASE_URL}/auth/refresh`) {
        return Promise.resolve(jsonResponse(200, { data: { ok: true } }));
      }

      const attempts = callsTo(fetchMock, url).length;
      return Promise.resolve(
        attempts % 2 === 1 ? jsonResponse(401, UNAUTHENTICATED) : jsonResponse(200, { data: attempts }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await getJson('/x');
    await getJson('/x');

    // The in-flight guard is cleared between calls, so a genuinely later expiry
    // can still be refreshed rather than being permanently swallowed.
    expect(callsTo(fetchMock, `${API_BASE_URL}/auth/refresh`)).toHaveLength(2);
  });
});

describe('token handling', () => {
  it('reads no token from web storage', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await postJson('/auth/login', { email: 'a@b.co', password: 'secret-value' });

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('sends no Authorization header of its own accord', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await getJson('/auth/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['Accept']);
  });

  it('reads the CSRF cookie, which is deliberately not httpOnly', () => {
    document.cookie = 'csrf_token=readable-value; path=/';

    expect(readCsrfToken()).toBe('readable-value');
  });

  it('returns null when there is no CSRF cookie', () => {
    expect(readCsrfToken()).toBeNull();
  });
});

/**
 * The bootstrap (api-spec.md §2.2.1).
 *
 * Without it a fresh browser cannot sign in at all: `csrf_token` is only set
 * after register, login or refresh, and each of those is itself a guarded unsafe
 * method. These tests pin that the client obtains one on demand, and — just as
 * importantly — that it does not spend the request when it already has a token.
 */
describe('CSRF bootstrap', () => {
  /** The bootstrap reads `response.json()`, unlike the envelope path which uses `text()`. */
  function csrfResponse(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    };
  }

  const BOOTSTRAPPED = { data: { csrfToken: 'bootstrapped-token' } };

  it('fetches a token and sends it as the header when the cookie is missing', async () => {
    fetchMock = vi.fn((input: unknown) =>
      Promise.resolve(
        String(input) === '/api/v1/auth/csrf'
          ? csrfResponse(200, BOOTSTRAPPED)
          : jsonResponse(200, { data: { ok: true } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await postJson('/auth/login', { email: 'a@b.co', password: 'secret-value' });

    expect(callsTo(fetchMock, '/api/v1/auth/csrf')).toHaveLength(1);

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('bootstrapped-token');
  });

  it('does not spend a request when the cookie is already present', async () => {
    document.cookie = 'csrf_token=already-here; path=/';

    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await postJson('/auth/login', { email: 'a@b.co', password: 'secret-value' });

    expect(callsTo(fetchMock, '/api/v1/auth/csrf')).toHaveLength(0);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('already-here');
  });

  it('never bootstraps for a read', async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await getJson('/auth/me');

    expect(callsTo(fetchMock, '/api/v1/auth/csrf')).toHaveLength(0);
  });

  it('shares one bootstrap between concurrent mutations', async () => {
    fetchMock = vi.fn((input: unknown) =>
      Promise.resolve(
        String(input) === '/api/v1/auth/csrf'
          ? csrfResponse(200, BOOTSTRAPPED)
          : jsonResponse(200, { data: { ok: true } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      postJson('/auth/login', { email: 'a@b.co', password: 'secret-value' }),
      postJson('/auth/register', { email: 'c@d.co', password: 'secret-value' }),
    ]);

    // One bootstrap for two mutations, the same de-duplication the silent refresh
    // uses. Two would also burn the 60/minute budget twice as fast for nothing.
    expect(callsTo(fetchMock, '/api/v1/auth/csrf')).toHaveLength(1);
  });

  it('returns the existing cookie without any request at all', async () => {
    document.cookie = 'csrf_token=already-here; path=/';

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCsrfToken()).resolves.toBe('already-here');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the request go out without a header when the bootstrap fails', async () => {
    // The alternative — throwing — would mask the real failure with a network
    // error from a request the user never made.
    fetchMock = vi.fn((input: unknown) =>
      String(input) === '/api/v1/auth/csrf'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(jsonResponse(200, { data: { ok: true } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(postJson('/auth/login', { email: 'a@b.co', password: 'secret-value' })).resolves.toEqual({
      ok: true,
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });

  it('treats a non-OK bootstrap as no token rather than throwing', async () => {
    fetchMock = vi.fn((input: unknown) =>
      Promise.resolve(
        String(input) === '/api/v1/auth/csrf'
          ? csrfResponse(429, { error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } })
          : jsonResponse(200, { data: { ok: true } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCsrfToken()).resolves.toBeNull();
  });

  it('bootstraps before the silent refresh, which is itself a mutation', async () => {
    // `POST /auth/refresh` is unsafe, so a refresh triggered with no cookie
    // present would 403 rather than recover the session.
    let meCalls = 0;

    fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === '/api/v1/auth/csrf') return Promise.resolve(csrfResponse(200, BOOTSTRAPPED));
      if (url === '/api/v1/auth/me') {
        // Expired on the first probe, valid again after the refresh replay.
        meCalls += 1;
        return Promise.resolve(
          meCalls === 1 ? jsonResponse(401, UNAUTHENTICATED) : jsonResponse(200, { data: { id: 'u1' } }),
        );
      }
      if (url === '/api/v1/auth/refresh') return Promise.resolve(jsonResponse(200, { data: { ok: true } }));

      return Promise.resolve(jsonResponse(200, { data: { ok: true } }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getJson('/auth/me')).resolves.toEqual({ id: 'u1' });

    expect(callsTo(fetchMock, '/api/v1/auth/csrf')).toHaveLength(1);

    const [, refreshInit] = callsTo(fetchMock, '/api/v1/auth/refresh')[0] as [string, RequestInit];
    expect((refreshInit.headers as Record<string, string>)['X-CSRF-Token']).toBe('bootstrapped-token');
  });
});
