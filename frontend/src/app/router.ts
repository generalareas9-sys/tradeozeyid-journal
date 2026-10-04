import { useEffect, useState } from 'react';
import type { AppRoute } from '../components/layout/routeConfig';
import { routes } from '../components/layout/routeConfig';

/**
 * A deliberately tiny client-side router.
 *
 * Phase 2 needs a route skeleton, not a routing library, so this module does
 * three things and nothing else: read the pathname, push history entries, and
 * match a path against the typed configuration. It is small enough to be
 * replaced wholesale if a library is adopted later.
 */

/** Trailing slashes collapse to the bare path so `/trades` and `/trades/` agree. */
export function normalizePathname(pathname: string): string {
  if (!pathname) return '/';

  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

const listeners = new Set<() => void>();

/** Pushes a history entry and tells every mounted `usePathname` to re-read. */
export function navigate(to: string): void {
  const next = normalizePathname(to);

  if (next === normalizePathname(window.location.pathname)) return;

  window.history.pushState(null, '', next);

  for (const listener of listeners) {
    listener();
  }
}

/** Subscribes a component to the current pathname, including back/forward. */
export function usePathname(): string {
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));

  useEffect(() => {
    const sync = () => setPathname(normalizePathname(window.location.pathname));

    listeners.add(sync);
    window.addEventListener('popstate', sync);

    return () => {
      listeners.delete(sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  return pathname;
}

export interface RouteMatch {
  route: AppRoute;
  /** Values captured from `:param` segments. */
  params: Record<string, string>;
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }

    if (patternPart !== pathPart) return null;
  }

  return params;
}

/** Static routes win over parameterised ones, so `/trades` never matches `/trades/:id`. */
export function matchRoute(pathname: string, candidates: readonly AppRoute[] = routes): RouteMatch | null {
  const normalized = normalizePathname(pathname);
  const ordered = [...candidates].sort((a, b) => {
    const aParametric = a.path.includes(':');
    const bParametric = b.path.includes(':');
    if (aParametric === bParametric) return 0;
    return aParametric ? 1 : -1;
  });

  for (const route of ordered) {
    if (route.path === normalized) {
      return { route, params: {} };
    }

    const params = matchPattern(route.path, normalized);
    if (params) {
      return { route, params };
    }
  }

  return null;
}