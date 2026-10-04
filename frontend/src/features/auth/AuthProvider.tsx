import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserResource } from '@tradeozeyid/contracts';
import { ApiRequestError } from '../../lib/api';
import * as authApi from './auth.api';

/**
 * Authenticated session state (docs/phase-plan.md, Phase 3: "auth context").
 *
 * The context holds only the *user profile*. There is no access token, no refresh
 * token and no CSRF secret in this state, because the first two are `httpOnly`
 * and unreadable by script and the third is read straight from the cookie inside
 * the HTTP client.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: UserResource | null;
  signIn: (email: string, password: string) => Promise<UserResource>;
  signUp: (input: authApi.RegisterInput) => Promise<UserResource>;
  signOut: () => Promise<void>;
  /** Re-reads the profile after a mutation. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserResource | null>(null);

  /**
   * On mount, ask the server who we are. A 401 here is the **normal** anonymous
   * answer, not an error worth surfacing, so it resolves to `anonymous` quietly.
   * This also exercises the silent-refresh path: `GET /auth/me` will attempt one
   * refresh before giving up.
   */
  useEffect(() => {
    let cancelled = false;

    authApi
      .currentUser()
      .then((profile) => {
        if (cancelled) return;
        setUser(profile);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        if (error instanceof ApiRequestError && error.status === 401) {
          setUser(null);
          setStatus('anonymous');
          return;
        }

        // A network or server fault resolves to `anonymous` too, confirmed by the
        // owner on 2026-10-03. The comment here previously claimed the app stayed
        // in `loading`; it does not, and `loading` is the wrong answer anyway —
        // a dead network must not leave the shell spinning forever, and the
        // protected-route gate already redirects an anonymous visitor to login.
        // A dedicated error state with a retry affordance would be the better UX
        // on a flaky connection, and is a separate, deliberate change.
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const profile = await authApi.login({ email, password });
    setUser(profile);
    setStatus('authenticated');
    return profile;
  }, []);

  const signUp = useCallback(async (input: authApi.RegisterInput) => {
    const profile = await authApi.register(input);
    setUser(profile);
    setStatus('authenticated');
    return profile;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // The local state clears even if the network call failed: the server may
      // already have revoked the family, and leaving a stale profile on screen
      // would be worse than a harmless failed request.
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const profile = await authApi.currentUser();
    setUser(profile);
    setStatus('authenticated');
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, refreshUser }),
    [status, user, signIn, signUp, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }

  return context;
}