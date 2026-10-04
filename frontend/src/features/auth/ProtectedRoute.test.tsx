import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';

/**
 * The protected-route wrapper (docs/phase-plan.md Phase 3).
 *
 * The component owns exactly one decision: whether to render the protected
 * children, the resolving fallback, or the anonymous fallback. Where the visitor
 * goes next is the router's business, so these tests cover the three states and
 * nothing about navigation.
 */

const RID = '0f9c1f2e-7d0b-4a52-9c9f-1c2e3f4a5b6c';

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

function stubSession(user: typeof USER | null | 'pending') {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);

      if (url === '/api/v1/auth/me') {
        if (user === 'pending') return new Promise(() => {});
        return Promise.resolve(
          user === null
            ? jsonResponse(401, UNAUTHENTICATED)
            : jsonResponse(200, { data: user, meta: { requestId: RID } }),
        );
      }

      if (url === '/api/v1/auth/refresh') return Promise.resolve(jsonResponse(401, UNAUTHENTICATED));

      return Promise.resolve(jsonResponse(401, UNAUTHENTICATED));
    }),
  );
}

function renderRoute() {
  return render(
    <AuthProvider>
      <ProtectedRoute
        fallback={<p>Resolving session</p>}
        anonymousFallback={<p>Sign in required</p>}
      >
        <p>Protected content</p>
      </ProtectedRoute>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProtectedRoute', () => {
  it('renders the fallback, not the children, while the session resolves', () => {
    stubSession('pending');

    renderRoute();

    expect(screen.getByText('Resolving session')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('renders the children once a session exists', async () => {
    stubSession(USER);

    renderRoute();

    expect(await screen.findByText('Protected content')).toBeTruthy();
    expect(screen.queryByText('Resolving session')).toBeNull();
  });

  it('renders the anonymous fallback, never the children, without a session', async () => {
    stubSession(null);

    renderRoute();

    expect(await screen.findByText('Sign in required')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('never reveals the protected children at any point for an anonymous visitor', async () => {
    stubSession(null);

    const { container } = renderRoute();

    await screen.findByText('Sign in required');

    // The whole rendered tree, not just the final state, must be free of the
    // protected text — a flash of protected content is the failure being guarded
    // against.
    expect(container.textContent).not.toContain('Protected content');
  });

  it('renders nothing when no fallback is supplied', () => {
    stubSession(null);

    const { container } = render(
      <AuthProvider>
        <ProtectedRoute>
          <p>Protected content</p>
        </ProtectedRoute>
      </AuthProvider>,
    );

    expect(container.textContent).toBe('');
  });
});
