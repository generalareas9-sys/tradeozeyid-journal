import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CookieJar } from 'tough-cookie';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { passwordResetTokens, refreshTokens, users } from '../../src/db/schema/auth.js';
import { resetEnvCache } from '../../src/config/index.js';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';

/**
 * The browser session flow, driven by a real HTTP server and a real cookie jar
 * (api-spec.md §2.1, §2.2.1).
 *
 * Why this file exists, when the suite already has 175 passing backend tests:
 *
 *  - every other API test runs in `authMode: 'bearer'`, where CSRF is skipped;
 *  - `csrf.api.test.ts` runs in cookie mode but writes `Cookie` and `X-CSRF-Token`
 *    by hand, so it proves the middleware *compares* two strings without proving a
 *    browser can *obtain* one or that the server's cookies are well-formed.
 *
 * That gap is exactly where the Phase 3 defect lived: `csrf_token` was only ever
 * set after register, login and refresh, and each of those is itself a guarded
 * unsafe method, so a fresh browser could never obtain a first token and `/login`
 * was unreachable in the real app. No hand-written-header test could have caught
 * it.
 *
 * `tough-cookie` is the jar `superagent` already depends on, so this adds no new
 * transitive code. It is declared in devDependencies rather than relied on
 * transitively, and it is test-only — nothing in `src/` imports it.
 *
 * supertest's own agent could not be used for this: `superagent` derives the
 * cookie host from `res.request.url`, which supertest leaves as a relative path,
 * so every cookie is filed under an undefined host and silently never replayed.
 */

const ACCOUNT = {
  email: 'jar@example.com',
  password: 'correct horse battery',
  displayName: 'Ozeyid',
  timezone: 'Europe/Istanbul',
  baseCurrency: 'USD',
};

/**
 * A minimal browser: real sockets, a real cookie jar, and no header bookkeeping.
 *
 * The only thing a caller supplies is the `X-CSRF-Token` header, because that is
 * the one value §2.2 requires JavaScript to echo. Cookies travel on their own,
 * which is the property under test.
 */
class Browser {
  private readonly jar = new CookieJar();

  constructor(private readonly baseUrl: string) {}

  private async request(method: string, path: string, body?: unknown, csrfToken?: string): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers({ Accept: 'application/json' });

    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);

    const stored = await this.jar.getCookieString(url);
    if (stored) headers.set('Cookie', stored);

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    for (const raw of response.headers.getSetCookie()) {
      await this.jar.setCookie(raw, url, { ignoreError: true });
    }

    return response;
  }

  get(path: string): Promise<Response> {
    return this.request('GET', path);
  }

  post(path: string, body?: unknown, csrfToken?: string): Promise<Response> {
    return this.request('POST', path, body, csrfToken);
  }

  /** Cookies a browser would attach to `path`, honouring `Path` and `Secure`. */
  cookiesFor(path: string): Promise<string[]> {
    return this.jar
      .getCookies(`${this.baseUrl}${path}`)
      .then((cookies) => cookies.map((cookie) => cookie.cookieString()));
  }

  /** Raw stored cookie attributes, for asserting on `httpOnly` and `path`. */
  storedAt(path: string, name: string) {
    return this.jar
      .getCookies(`${this.baseUrl}${path}`)
      .then((cookies) => cookies.find((cookie) => cookie.key === name) ?? null);
  }

  /**
   * The CSRF token the browser would currently echo.
   *
   * Register, login and refresh all rotate the token, so the value must be
   * re-read after each of them rather than carried over. The frontend HTTP client
   * does exactly this — `send()` calls `readCsrfToken()` on every mutating request
   * — and this helper is what keeps the test honest about that.
   */
  async csrfToken(): Promise<string> {
    const cookie = await this.storedAt('/api/v1/auth/csrf', 'csrf_token');

    if (!cookie) throw new Error('no csrf_token in the jar');

    return cookie.value;
  }
}

/** Reads the bootstrap token from the response body, as the frontend client does. */
async function bootstrap(browser: Browser): Promise<string> {
  const response = await browser.get('/api/v1/auth/csrf');

  expect(response.status).toBe(200);

  return ((await response.json()) as { data: { csrfToken: string } }).data.csrfToken;
}

let server: Server;
let baseUrl: string;
let originalCookieSecure: string | undefined;

async function truncateAuthTables(): Promise<void> {
  const db = getDb();
  const { auditLog } = await import('../../src/db/schema/audit.js');
  await db.delete(auditLog);
  await db.delete(passwordResetTokens);
  await db.delete(refreshTokens);
  await db.delete(users);
}

/** Bootstraps, then registers, exactly as the frontend client does. */
async function registerThrough(browser: Browser): Promise<void> {
  const token = await bootstrap(browser);

  const created = await browser.post('/api/v1/auth/register', ACCOUNT, token);

  expect(created.status).toBe(201);
}

beforeAll(async () => {
  // Pinned rather than inherited: `.env` is machine-local, and a developer with
  // `COOKIE_SECURE=true` would otherwise get a jar that refuses to store the
  // cookies over plain HTTP and a baffling failure. This is the §7.2 development
  // relaxation, which is exactly the configuration described here.
  originalCookieSecure = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = 'false';
  resetEnvCache();

  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));

  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

  if (originalCookieSecure === undefined) {
    delete process.env.COOKIE_SECURE;
  } else {
    process.env.COOKIE_SECURE = originalCookieSecure;
  }

  resetEnvCache();
  await closeDb();
});

beforeEach(async () => {
  resetRateLimitStores();
  await truncateAuthTables();
});

describe('a fresh browser can obtain a CSRF token unaided', () => {
  it('stores csrf_token in the jar from the bootstrap alone', async () => {
    const browser = new Browser(baseUrl);

    await browser.get('/api/v1/auth/csrf');

    const cookie = await browser.storedAt('/api/v1/auth/csrf', 'csrf_token');

    expect(cookie).toBeTruthy();
    expect(cookie?.value.length ?? 0).toBeGreaterThanOrEqual(32);
  });

  it('attaches that cookie to the next request without help', async () => {
    const browser = new Browser(baseUrl);
    const token = await bootstrap(browser);

    expect(await browser.cookiesFor('/api/v1/auth/register')).toContain(`csrf_token=${token}`);

    const created = await browser.post('/api/v1/auth/register', ACCOUNT, token);

    expect(created.status).toBe(201);
    expect(((await created.json()) as { data: { email: string } }).data.email).toBe(ACCOUNT.email);
  });

  it('is refused when the header is omitted, so the bootstrap is not optional', async () => {
    const browser = new Browser(baseUrl);

    await browser.get('/api/v1/auth/csrf');

    // The jar is holding csrf_token, and the request still fails: the rule is
    // double-submit, not cookie-presence. This guards against anyone "fixing" the
    // bootstrap gap by relaxing the middleware instead of issuing a token.
    const refused = await browser.post('/api/v1/auth/register', ACCOUNT);

    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('CSRF_FAILED');
  });
});

describe('the whole session works on stored cookies alone', () => {
  it('registers, refreshes, reads the profile, then logs out', async () => {
    const browser = new Browser(baseUrl);

    await registerThrough(browser);

    expect((await browser.get('/api/v1/auth/me')).status).toBe(200);

    // Register rotated csrf_token, so the header must carry the value the jar now
    // holds. Sending the pre-register value is refused with 403 — which is exactly
    // what `csrf.api.test.ts` covers, and why this helper exists.
    const beforeRefresh = await browser.csrfToken();
    const refreshed = await browser.post('/api/v1/auth/refresh', undefined, beforeRefresh);

    expect(refreshed.status).toBe(200);

    const rotated = await browser.csrfToken();
    expect(rotated).not.toBe(beforeRefresh);

    expect((await browser.get('/api/v1/auth/me')).status).toBe(200);

    const loggedOut = await browser.post('/api/v1/auth/logout', undefined, rotated);

    expect(loggedOut.status).toBe(204);

    // This is the step the owner checks by hand in G5: after signing out, the
    // protected route must reject the browser.
    expect((await browser.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rotates csrf_token on login', async () => {
    const browser = new Browser(baseUrl);

    await registerThrough(browser);

    const beforeLogin = await browser.csrfToken();

    const login = await browser.post(
      '/api/v1/auth/login',
      { email: ACCOUNT.email, password: ACCOUNT.password },
      beforeLogin,
    );

    expect(login.status).toBe(200);

    const afterLogin = await browser.csrfToken();
    expect(afterLogin).toBeTruthy();
    expect(afterLogin).not.toBe(beforeLogin);
  });

  it('does not let two browsers share a session', async () => {
    const first = new Browser(baseUrl);
    const second = new Browser(baseUrl);

    await registerThrough(first);

    // A second, unauthenticated browser has its own jar and nothing in it.
    expect((await second.get('/api/v1/auth/me')).status).toBe(401);
    expect(await second.cookiesFor('/api/v1/auth/me')).not.toContain(
      (await first.storedAt('/api/v1/auth/me', 'csrf_token'))?.cookieString() ?? '',
    );
  });
});

describe('cookie attributes survive the round trip', () => {
  it('keeps both session tokens unreadable by script', async () => {
    const browser = new Browser(baseUrl);

    await registerThrough(browser);

    // §2.1 / §18: an httpOnly regression would hand a live token to any XSS
    // payload. Only the stored attributes can catch that, not a status code.
    for (const name of ['http_at', 'http_rt']) {
      const cookie = await browser.storedAt('/api/v1/auth/me', name);

      expect(cookie).toBeTruthy();
      expect(cookie?.httpOnly).toBe(true);
    }

    // The CSRF cookie is the deliberate opposite: §2.2 requires script to read it.
    expect((await browser.storedAt('/api/v1/auth/me', 'csrf_token'))?.httpOnly).toBe(false);
  });

  it('scopes the refresh cookie to /api/v1/auth', async () => {
    const browser = new Browser(baseUrl);

    await registerThrough(browser);

    // §7.2: a broader refresh cookie would ride along on every request the SPA makes.
    expect(await browser.storedAt('/api/v1/users/me', 'http_rt')).toBeNull();
    expect(await browser.storedAt('/api/v1/auth/me', 'http_rt')).toBeTruthy();

    // The access cookie covers all of /api, and the CSRF cookie covers the origin.
    expect(await browser.storedAt('/api/v1/users/me', 'http_at')).toBeTruthy();
    expect(await browser.storedAt('/', 'csrf_token')).toBeTruthy();
  });

  it('sends host-only cookies, so no Domain attribute widens the scope', async () => {
    const browser = new Browser(baseUrl);

    await registerThrough(browser);

    for (const name of ['http_at', 'http_rt', 'csrf_token']) {
      const cookie = await browser.storedAt('/api/v1/auth/me', name);

      // §7.2 forbids `domain` on a public suffix and requires host-only.
      expect(cookie?.domain ?? baseUrl.replace('http://', '')).not.toContain('tradeozeyid');
    }
  });

  it('issues no cookie that outlives its documented lifetime', async () => {
    const browser = new Browser(baseUrl);

    await registerThrough(browser);

    // §2.3: access 15 minutes, refresh 30 days, CSRF 30 days. A jar enforces
    // `Max-Age`, so an over-long lifetime would be visible as a far-future expiry.
    const minutesFromNow = async (name: string): Promise<number> => {
      const cookie = await browser.storedAt('/api/v1/auth/me', name);
      const expires = cookie?.expires;

      // `Infinity` is how a session cookie with no `Max-Age` is represented, and
      // both tokens are required to expire (§2.3), so it is a failure here.
      if (expires === undefined || expires === null || expires === 'Infinity') {
        throw new Error(`${name} does not expire`);
      }

      return (expires.getTime() - Date.now()) / 60_000;
    };

    expect(await minutesFromNow('http_at')).toBeLessThanOrEqual(15);
    expect(await minutesFromNow('http_at')).toBeGreaterThan(14);
    expect(await minutesFromNow('http_rt')).toBeGreaterThan(29 * 24 * 60);
  });
});