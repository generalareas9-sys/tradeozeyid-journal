import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../AuthProvider';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { ResetPasswordPage } from './ResetPasswordPage';

/**
 * The signed-out screens (docs/phase-plan.md Phase 3).
 *
 * All four are driven through the real HTTP client with only `fetch` stubbed, so
 * the URL, the envelope and the CSRF header are the ones production sends. Each
 * screen is asserted on the two things it is actually for: refusing to send an
 * invalid request, and showing the server's own wording rather than inventing any.
 */

const RID = '0f9c1f2e-7d0b-4a52-9c9f-1c2e3f4a5b6c';

const USER = {
  id: '9a1c3f52-6d4e-4a1b-9c77-2f6b0e5d8a31',
  email: 'trader@example.com',
  displayName: 'Ozeyid',
  timezone: 'Europe/Istanbul',
  baseCurrency: 'USD',
  locale: 'en-GB',
  status: 'active',
  emailVerifiedAt: null,
  defaultRiskPercent: 1,
  lastLoginAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function errorBody(code: string, message: string, details?: unknown[]) {
  return {
    error: { code, message, ...(details ? { details } : {}) },
    meta: { requestId: RID },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function routeFetch(handler: (url: string, init?: RequestInit) => unknown) {
  fetchMock = vi.fn((input: unknown, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
}

/** The signed-out session probe every screen triggers on mount. */
const signedOut: Record<string, () => unknown> = {
  '/api/v1/auth/me': () => jsonResponse(401, errorBody('UNAUTHENTICATED', 'Authentication required')),
  '/api/v1/auth/refresh': () => jsonResponse(401, errorBody('UNAUTHENTICATED', 'Authentication required')),
};

function bodyOf(url: string): Record<string, unknown> {
  const entry = fetchMock.mock.calls.find((call) => String(call[0]) === url) as
    | [string, RequestInit]
    | undefined;
  const raw = entry?.[1]?.body;

  return raw ? (JSON.parse(String(raw)) as Record<string, unknown>) : {};
}

function callsTo(url: string): unknown[][] {
  return fetchMock.mock.calls.filter((call) => String(call[0]) === url);
}

/** Wraps a screen that needs the auth context. */
function withAuth(node: ReactNode) {
  return <AuthProvider>{node}</AuthProvider>;
}

beforeEach(() => {
  window.history.pushState(null, '', '/');
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState(null, '', '/');
});

describe('LoginPage', () => {
  function fillAndSubmit(email: string, password: string) {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('asks for both fields', () => {
    routeFetch((url) => signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } }));
    render(withAuth(<LoginPage />));

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('refuses to send an empty form', () => {
    routeFetch((url) => signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } }));
    render(withAuth(<LoginPage />));

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Email is required')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(callsTo('/api/v1/auth/login')).toHaveLength(0);
  });

  it('refuses to send a malformed address or a short password', () => {
    routeFetch((url) => signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } }));
    render(withAuth(<LoginPage />));

    fillAndSubmit('not-an-email', 'short');

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Password must be at least 10 characters')).toBeTruthy();
    expect(callsTo('/api/v1/auth/login')).toHaveLength(0);
  });

  it('signs in and lands on the dashboard', async () => {
    routeFetch((url) => {
      if (url === '/api/v1/auth/login') return jsonResponse(200, { data: USER, meta: { requestId: RID } });
      return signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } });
    });

    render(withAuth(<LoginPage />));
    fillAndSubmit('trader@example.com', 'correct horse battery');

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(bodyOf('/api/v1/auth/login')).toEqual({
      email: 'trader@example.com',
      password: 'correct horse battery',
    });
  });

  it('shows the server wording for bad credentials, inventing no detail', async () => {
    window.history.pushState(null, '', '/login');

    routeFetch((url) => {
      if (url === '/api/v1/auth/login') {
        return jsonResponse(401, errorBody('INVALID_CREDENTIALS', 'Invalid email or password'));
      }
      return signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } });
    });

    render(withAuth(<LoginPage />));
    fillAndSubmit('trader@example.com', 'correct horse battery');

    // api-spec.md §5: the message must not reveal whether the account exists.
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Invalid email or password',
    );
    expect(window.location.pathname).toBe('/login');
  });

  it('reports a transport failure without claiming the password was wrong', async () => {
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input);
      if (url === '/api/v1/auth/login') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } }));
    }));

    render(withAuth(<LoginPage />));
    fillAndSubmit('trader@example.com', 'correct horse battery');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Check your connection');
  });

  it('sends the CSRF header on the login request', async () => {
    document.cookie = 'csrf_token=csrf-value; path=/';
    routeFetch((url) => {
      if (url === '/api/v1/auth/login') return jsonResponse(200, { data: USER, meta: { requestId: RID } });
      return signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } });
    });

    render(withAuth(<LoginPage />));
    fillAndSubmit('trader@example.com', 'correct horse battery');

    await waitFor(() => expect(window.location.pathname).toBe('/'));

    const [, init] = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/v1/auth/login') as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-value');
  });
});

describe('RegisterPage', () => {
  function fillValid() {
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ozeyid' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'trader@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
  }

  it('refuses to send an incomplete form', () => {
    routeFetch((url) => signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } }));
    render(withAuth(<RegisterPage />));

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Display name is required')).toBeTruthy();
    expect(screen.getByText('Email is required')).toBeTruthy();
    expect(callsTo('/api/v1/auth/register')).toHaveLength(0);
  });

  it('creates the account with a browser timezone and the chosen currency', async () => {
    routeFetch((url) => {
      if (url === '/api/v1/auth/register') {
        return jsonResponse(201, { data: USER, meta: { requestId: RID } });
      }
      return signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } });
    });

    render(withAuth(<RegisterPage />));
    fillValid();
    fireEvent.change(screen.getByLabelText('Base currency'), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(window.location.pathname).toBe('/'));

    const sent = bodyOf('/api/v1/auth/register');
    expect(sent.displayName).toBe('Ozeyid');
    expect(sent.baseCurrency).toBe('EUR');
    // The browser's own zone, never a guess made on the server.
    expect(typeof sent.timezone).toBe('string');
    expect(String(sent.timezone).length).toBeGreaterThan(0);
  });

  it('shows the duplicate-account message from the server', async () => {
    routeFetch((url) => {
      if (url === '/api/v1/auth/register') {
        return jsonResponse(409, errorBody('CONFLICT', 'An account with that email already exists'));
      }
      return signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } });
    });

    render(withAuth(<RegisterPage />));
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('An account with that email already exists');
  });

  it('maps a server field error onto the field', async () => {
    routeFetch((url) => {
      if (url === '/api/v1/auth/register') {
        return jsonResponse(
          400,
          errorBody('VALIDATION_ERROR', 'Request validation failed', [
            { path: 'email', message: 'That address is already in use' },
          ]),
        );
      }
      return signedOut[url]?.() ?? jsonResponse(200, { data: { ok: true } });
    });

    render(withAuth(<RegisterPage />));
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('That address is already in use')).toBeTruthy();
  });
});

describe('ForgotPasswordPage', () => {
  it('shows the same neutral message whether or not the account exists', async () => {
    const message = 'If an account exists for that address, a password reset link has been sent.';

    routeFetch((url) => {
      if (url === '/api/v1/auth/forgot-password') {
        return jsonResponse(202, { data: { message }, meta: { requestId: RID } });
      }
      return jsonResponse(200, { data: { ok: true } });
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe(message);
  });

  it('locks the form once the link has been requested', async () => {
    routeFetch((url) => {
      if (url === '/api/v1/auth/forgot-password') {
        return jsonResponse(202, {
          data: { message: 'If an account exists for that address, a password reset link has been sent.' },
          meta: { requestId: RID },
        });
      }
      return jsonResponse(200, { data: { ok: true } });
    });

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'trader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: 'Send reset link' })).toHaveProperty('disabled', true);
  });

  it('refuses to send a malformed address', () => {
    routeFetch(() => jsonResponse(200, { data: { ok: true } }));
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(callsTo('/api/v1/auth/forgot-password')).toHaveLength(0);
  });
});

describe('ResetPasswordPage', () => {
  it('explains itself when the link carries no token', () => {
    render(<ResetPasswordPage token="" />);

    expect(screen.getByText('This link is missing its token.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Open the link from your reset email again');
  });

  it('refuses a confirmation that does not match', () => {
    routeFetch(() => jsonResponse(204, undefined as unknown as Record<string, unknown>));
    render(<ResetPasswordPage token="a-token" />);

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(screen.getByText('The two passwords do not match')).toBeTruthy();
    expect(callsTo('/api/v1/auth/reset-password')).toHaveLength(0);
  });

  it('sends the token and returns the user to sign in', async () => {
    routeFetch(() => jsonResponse(204, undefined as unknown as Record<string, unknown>));
    render(<ResetPasswordPage token="a-token" />);

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(bodyOf('/api/v1/auth/reset-password')).toEqual({
      token: 'a-token',
      password: 'correct horse battery',
    });
  });

  it('explains an expired or already-used token', async () => {
    routeFetch((url) => {
      if (url === '/api/v1/auth/reset-password') {
        return jsonResponse(404, errorBody('NOT_FOUND', 'Reset token is invalid or has expired'));
      }
      return jsonResponse(200, { data: { ok: true } });
    });

    render(<ResetPasswordPage token="stale-token" />);

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Reset token is invalid or has expired',
    );
  });
});
