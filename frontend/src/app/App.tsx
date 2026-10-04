import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppShell } from '../components/layout/AppShell';
import {
  HOME_PATH,
  NOT_FOUND_TITLE,
  SIGN_IN_PATH,
  allRoutes,
} from '../components/layout/routeConfig';
import type { AppRoute } from '../components/layout/routeConfig';
import { DashboardPage } from '../components/pages/DashboardPage';
import { NotFoundPage } from '../components/pages/NotFoundPage';
import { PlaceholderPage } from '../components/pages/PlaceholderPage';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { RegisterPage } from '../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';
import { HealthPanel } from '../features/health/HealthPanel';
import { TradeDetailPage } from '../features/trades/TradeDetailPage';
import { StrategyListPage } from '../features/strategies/StrategyListPage';
import { StrategyDetailPage } from '../features/strategies/StrategyDetailPage';
import { TagListPage } from '../features/tags/TagListPage';
import { matchRoute, navigate, usePathname } from './router';

/**
 * Session-gated routing (docs/phase-plan.md, Phase 3).
 *
 * api-spec.md §2.3 fixes both directions of travel:
 *  - a protected screen reached without a session goes to `/login`;
 *  - a signed-out screen reached *with* a session goes to the dashboard.
 *
 * The decision lives here, in one place, so every route behaves identically
 * instead of each screen inventing its own redirect.
 */

/** The single-use reset token arrives in the emailed link as `?token=`. */
function readResetToken(): string {
  return new URLSearchParams(window.location.search).get('token') ?? '';
}

/** Signed-out screens. Each owns its own `h1` and its own layout. */
function AuthView({ route }: { route: AppRoute }) {
  switch (route.path) {
    case '/register':
      return <RegisterPage />;
    case '/forgot-password':
      return <ForgotPasswordPage />;
    case '/reset-password':
      return <ResetPasswordPage token={readResetToken()} />;
    default:
      return <LoginPage />;
  }
}

/** Workspace screens. The shell supplies the page's `h1`, so none of these do. */
function WorkspaceView({ route }: { route: AppRoute }) {
  // Trade detail is a nested route with params, handle it before the kind switch
  if (route.path === '/trades/:id') {
    return <TradeDetailPage />;
  }
  if (route.path === '/strategies/:id') {
    return <StrategyDetailPage />;
  }

  switch (route.kind) {
    case 'health':
      return <HealthPanel />;
    case 'dashboard':
      return <DashboardPage phase={route.phase} description={route.description} />;
    case 'strategies':
      return <StrategyListPage />;
    case 'tags':
      return <TagListPage />;
    default:
      return <PlaceholderPage phase={route.phase} description={route.description} />;
  }
}

/** Rendered while the session is still being resolved. */
function SessionPending() {
  return (
    <p role="status" className="text-sm text-text-muted">
      Checking your session…
    </p>
  );
}

/**
 * Wraps a signed-out screen: an existing session is sent to the dashboard
 * instead, so signing in twice is not possible.
 */
function SignedOutGate({ route }: { route: AppRoute }) {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'authenticated') navigate(HOME_PATH);
  }, [status]);

  if (status === 'loading') return <SessionPending />;
  if (status === 'authenticated') return null;

  return <AuthView route={route} />;
}

/**
 * Wraps a protected screen: an anonymous visitor is sent to sign in. The
 * `ProtectedRoute` owns the two states it renders; this owns what happens next.
 */
function SignedInGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'anonymous') navigate(SIGN_IN_PATH);
  }, [status]);

  return (
    <ProtectedRoute
      fallback={<SessionPending />}
      anonymousFallback={
        <p role="status" className="text-sm text-text-muted">
          Redirecting to sign in…
        </p>
      }
    >
      {children}
    </ProtectedRoute>
  );
}

/**
 * The signed-in shell.
 *
 * This is a separate component from `App` on purpose: it has to sit *inside*
 * `AuthProvider` to read the session, and `App` itself is the provider's parent.
 */
function SignedInShell() {
  const pathname = usePathname();
  const match = matchRoute(pathname, allRoutes);
  const { user, status, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const signedIn = status === 'authenticated';

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await signOut();
    } finally {
      // `signOut` clears local state even if the request failed, and the
      // `SignedInGate` redirect takes it from there.
      setSigningOut(false);
    }
  }

  return (
    <AppShell
      pageTitle={match?.route.title ?? NOT_FOUND_TITLE}
      pathname={pathname}
      displayName={user?.displayName ?? null}
      onSignOut={signedIn ? () => void handleSignOut() : undefined}
      signingOut={signingOut}
    >
      <SignedInGate>
        {match ? <WorkspaceView route={match.route} /> : <NotFoundPage pathname={pathname} />}
      </SignedInGate>
    </AppShell>
  );
}

/**
 * Resolves the pathname to a route and renders it.
 *
 * Signed-out screens sit outside the shell because they have no navigation and
 * no account context to offer. Everything else renders inside the shell,
 * including an unmatched path, whose page title falls back to the shell heading
 * so the visitor keeps their navigation and can get back.
 */
export default function App() {
  const pathname = usePathname();
  const match = matchRoute(pathname, allRoutes);

  if (match?.route.kind === 'auth') {
    return (
      <AuthProvider>
        <div className="min-h-screen bg-background">
          <SignedOutGate route={match.route} />
        </div>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <SignedInShell />
    </AuthProvider>
  );
}
