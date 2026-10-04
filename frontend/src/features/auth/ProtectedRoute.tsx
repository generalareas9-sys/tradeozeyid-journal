import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Protected-route wrapper (docs/phase-plan.md, Phase 3).
 *
 * Renders nothing but a status while the session is still being resolved, so a
 * protected screen never flashes before the redirect. When the session is
 * anonymous the caller is expected to route to a login screen; this component
 * owns the decision so every protected route behaves identically.
 */

export type AnonymousBehaviour = 'render-login' | 'render-fallback';

export interface ProtectedRouteProps {
  children: ReactNode;
  /** Shown while the session is being resolved. */
  fallback?: ReactNode;
  /** Shown to an anonymous visitor instead of `children`. */
  anonymousFallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  fallback = null,
  anonymousFallback = null,
}: ProtectedRouteProps) {
  const { status } = useAuth();

  if (status === 'loading') {
    return <>{fallback}</>;
  }

  if (status === 'anonymous') {
    return <>{anonymousFallback}</>;
  }

  return <>{children}</>;
}