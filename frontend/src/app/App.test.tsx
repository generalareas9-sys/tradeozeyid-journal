import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { workspaceRoutes } from '../components/layout/routeConfig';

const RID = '0f9c1f2e-7d0b-4a52-9c9f-1c2e3f4a5b6c';

const HEALTH_OK = {
  data: {
    status: 'ok',
    version: '0.1.0',
    database: 'ok',
    uptimeSeconds: 4211,
  },
  meta: { requestId: RID },
};

/** A signed-in user, shaped by `UserResource` in packages/contracts. */
const USER = {
  id: '9a1c3f52-6d4e-4a1b-9c77-2f6b0e5d8a31',
  email: 'trader@example.com',
  displayName: 'Test Trader',
  timezone: 'Europe/London',
  baseCurrency: 'USD',
  locale: 'en-GB',
  status: 'active',
  emailVerifiedAt: null,
  defaultRiskPercent: 1,
  lastLoginAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
};

const UNAUTHENTICATED = {
  error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
  meta: { requestId: RID },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

interface StubApiOptions {
  /** `null` makes `GET /auth/me` answer 401, i.e. an anonymous visitor. */
  user?: typeof USER | null;
  /** An `Error` makes the health endpoint unreachable at the network layer. */
  health?: unknown | Error;
}

/**
 * Stubs the two endpoints the app touches on a cold load: the session probe and
 * the foundation health check. Anything else rejects, so an unexpected request
 * fails the test instead of silently resolving.
 */
function stubApi({ user = USER, health = HEALTH_OK }: StubApiOptions = {}) {
  const fetchMock = vi.fn((input: unknown) => {
    const url = String(input);

    if (url === '/api/v1/auth/me') {
      return Promise.resolve(
        user === null
          ? jsonResponse(401, UNAUTHENTICATED)
          : jsonResponse(200, { data: user, meta: { requestId: RID } }),
      );
    }

    // The silent refresh has nothing to offer in these tests, so it fails and the
    // 401 propagates — the same path a real signed-out visitor takes.
    if (url === '/api/v1/auth/refresh') {
      return Promise.resolve(jsonResponse(401, UNAUTHENTICATED));
    }

    if (url === '/api/v1/health') {
      return health instanceof Error
        ? Promise.reject(health)
        : Promise.resolve(jsonResponse(200, health));
    }

    return Promise.reject(new Error(`unstubbed request: ${url}`));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The calls made to one exact URL, so an added request cannot skew a count. */
function callsTo(fetchMock: ReturnType<typeof stubApi>, url: string): unknown[][] {
  return fetchMock.mock.calls.filter((call) => String(call[0]) === url);
}

function goTo(path: string) {
  window.history.pushState(null, '', path);
}

beforeEach(() => {
  goTo('/');
  // Protected screens need a session; every test overrides this if it cares.
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  goTo('/');
});

describe('App navigation', () => {
  it('renders every MVP area in the workspace navigation', () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    const expected = [
      'Dashboard',
      'Trades',
      'Trading accounts',
      'Strategies',
      'Tags',
      'Journal',
      'Reviews',
      'Analytics',
      'Risk calculator',
    ];

    // One link per documented MVP area, and no more.
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(expected.length);

    for (const title of expected) {
      expect(within(nav).getByRole('link', { name: title })).toBeTruthy();
    }

    // The configuration and the navigation agree.
    expect(expected).toEqual(workspaceRoutes.map((route) => route.title));
  });

  it('keeps the foundation check out of the business navigation', () => {
    render(<App />);

    const workspace = screen.getByRole('navigation', { name: 'Workspace' });
    const system = screen.getByRole('navigation', { name: 'System' });

    expect(workspace.textContent).not.toContain('Foundation status');
    expect(system.textContent).toContain('Foundation status');
  });

  it('marks the current route with aria-current', () => {
    goTo('/strategies');
    render(<App />);

    expect(screen.getByRole('link', { name: 'Strategies' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Trades' }).getAttribute('aria-current')).toBeNull();
  });

  it('changes the displayed placeholder page when a link is chosen', async () => {
    render(<App />);

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(screen.getByText(/Overview of the account/)).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Analytics' }));

    expect(window.location.pathname).toBe('/analytics');
    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeTruthy();
    expect(screen.getByText(/Performance, strategy, session/)).toBeTruthy();
    expect(screen.queryByText(/Overview of the account/)).toBeNull();
  });

  it('shows the phase each area is planned for', async () => {
    goTo('/trades');
    render(<App />);

    expect(await screen.findByText('Planned for Phase 5')).toBeTruthy();
    expect(screen.getByText('No data is requested by this screen.')).toBeTruthy();
  });

  it('routes a nested path to its own placeholder', async () => {
    goTo('/trades/abc-123');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Trade detail' })).toBeTruthy();
    // The static /trades entry must not swallow the parameterised route.
    expect(screen.getByText(/One trade in full/)).toBeTruthy();
  });

  it('treats a trailing slash as the same page', async () => {
    goTo('/trades/');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Trades' })).toBeTruthy();
  });

  it('renders Not Found for an unknown path and offers a way back', async () => {
    goTo('/not-a-real-area');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByText('/not-a-real-area')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });
});

describe('App — Phase 3 session gating', () => {
  it('sends an anonymous visitor from a protected screen to sign in', async () => {
    stubApi({ user: null });

    goTo('/trades');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
  });

  it('sends an existing session away from the sign-in screen', async () => {
    stubApi();

    goTo('/login');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('does not reveal a protected screen before the session resolves', () => {
    // A probe that never answers stands in for a slow network.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    goTo('/trades');
    render(<App />);

    expect(screen.queryByText('Planned for Phase 5')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Checking your session');
  });

  it('keeps the signed-out screens out of the workspace shell', async () => {
    stubApi({ user: null });

    goTo('/login');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).toBeNull();
  });

  it('offers no sign-out control to an anonymous visitor', async () => {
    stubApi({ user: null });

    goTo('/trades');
    render(<App />);

    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('signs the user out and returns to the sign-in screen', async () => {
    let signedOut = false;

    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);

      if (url === '/api/v1/auth/logout') {
        signedOut = true;
        return Promise.resolve({ ok: true, status: 204, statusText: 'No Content', text: () => Promise.resolve('') });
      }

      if (url === '/api/v1/auth/me') {
        // After sign-out the server has no session, exactly as it would in the browser.
        return Promise.resolve(
          signedOut
            ? jsonResponse(401, UNAUTHENTICATED)
            : jsonResponse(200, { data: USER, meta: { requestId: RID } }),
        );
      }

      if (url === '/api/v1/auth/refresh') {
        return Promise.resolve(jsonResponse(401, UNAUTHENTICATED));
      }

      return Promise.reject(new Error(`unstubbed request: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    goTo('/trades');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
    expect(callsTo(fetchMock, '/api/v1/auth/logout')).toHaveLength(1);
  });

  it('names the signed-in user beside the sign-out control', async () => {
    stubApi();

    render(<App />);

    await screen.findByRole('button', { name: 'Sign out' });
    expect(screen.getByText('Test Trader')).toBeTruthy();
  });
});

describe('App — Phase 1 health functionality', () => {
  it('still calls GET /api/v1/health from the foundation screen', async () => {
    const fetchMock = stubApi();

    goTo('/foundation');
    render(<App />);

    await screen.findByText('API reachable');

    expect(callsTo(fetchMock, '/api/v1/health')).toHaveLength(1);
    expect(screen.getByText('Database').nextSibling?.textContent).toBe('ok');
    expect(screen.getByText('Version').nextSibling?.textContent).toBe('0.1.0');
  });

  it('does not call the health endpoint from a workspace area', async () => {
    const fetchMock = stubApi();

    goTo('/dashboard-not-a-route');
    render(<App />);

    expect(callsTo(fetchMock, '/api/v1/health')).toHaveLength(0);
  });

  it('reports an unreachable API from the foundation screen', async () => {
    stubApi({ health: new TypeError('Failed to fetch') });

    goTo('/foundation');
    render(<App />);

    await screen.findByText('API unreachable');
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
