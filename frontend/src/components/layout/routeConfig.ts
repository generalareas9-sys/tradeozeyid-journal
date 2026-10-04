/**
 * The single source of truth for the Phase 2 route skeleton.
 *
 * Every area here is derived from the locked documents, not invented:
 *  - the path segments come from the endpoint index in `docs/api-spec.md` §3;
 *  - the phase numbers come from `docs/phase-plan.md`;
 *  - `auth` and `users` are deliberately absent — authentication is Phase 3;
 *  - there is no Progress area: `docs/README.md` records it as a product area
 *    with no assigned phase.
 *
 * Phase 2 ships the dashboard's empty layout and placeholders for every other
 * area. The paths, titles, descriptions and phase numbers exist now so the shell
 * is complete; the screens and data arrive in the phase named here.
 */

export type RouteGroup = 'workspace' | 'system' | 'public';

export type RouteKind =
  /** The dashboard landing screen, laid out with empty regions. */
  | 'dashboard'
  /** A placeholder screen describing what the area will hold. */
  | 'placeholder'
  /** The Phase 1 foundation health check, preserved from before the shell. */
  | 'health'
  /** Signed-out authentication screens (Phase 3). */
  | 'auth'
  /** Strategies list and detail (Phase 7). */
  | 'strategies'
  /** Tags list (Phase 7). */
  | 'tags';

export interface AppRoute {
  /** Absolute path. `:param` segments are supported for nested screens. */
  path: string;
  title: string;
  /** One sentence on what the area is for. Must not imply live data. */
  description: string;
  /** Phase of `docs/phase-plan.md` that delivers the real feature. */
  phase: number;
  group: RouteGroup;
  kind: RouteKind;
}

export const routes: readonly AppRoute[] = [
  {
    path: '/',
    title: 'Dashboard',
    description:
      'Overview of the account: equity curve, drawdown, calendar heatmap and recent trades. Part of the TradeOzeyid workspace.',
    phase: 8,
    group: 'workspace',
    kind: 'dashboard',
  },
  {
    path: '/trades',
    title: 'Trades',
    description:
      'The trade journal: full table, filters, entry form, close dialog, plus Day View and Week View. Part of the TradeOzeyid workspace.',
    phase: 5,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/trades/:id',
    title: 'Trade detail',
    description:
      'One trade in full: information, executions, risk, strategy, tags, screenshots, notes and review. Part of the TradeOzeyid workspace.',
    phase: 6,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/trading-accounts',
    title: 'Trading accounts',
    description:
      'Broker, demo and prop accounts with balances and archive controls. Part of the TradeOzeyid workspace.',
    phase: 4,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/strategies',
    title: 'Strategies',
    description:
      'Reusable trade setups and their ordered rule checklists. Part of the TradeOzeyid workspace.',
    phase: 7,
    group: 'workspace',
    kind: 'strategies',
  },
  {
    path: '/strategies/:id',
    title: 'Strategy detail',
    description:
      'One strategy in full: information, ordered rule checklist, trade count. Part of the TradeOzeyid workspace.',
    phase: 7,
    group: 'workspace',
    kind: 'strategies',
  },
  {
    path: '/tags',
    title: 'Tags',
    description:
      'User-scoped labels with categories, used to slice the journal. Part of the TradeOzeyid workspace.',
    phase: 7,
    group: 'workspace',
    kind: 'tags',
  },
  {
    path: '/journal',
    title: 'Journal',
    description:
      'The daily journal entry with emotions attached, grouped by your timezone. Part of the TradeOzeyid workspace.',
    phase: 11,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/reviews',
    title: 'Reviews',
    description:
      'Daily, weekly and monthly written reviews and psychology reports. Part of the TradeOzeyid workspace.',
    phase: 11,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/analytics',
    title: 'Analytics',
    description:
      'Performance, strategy, session, symbol, direction and tag analytics. Part of the TradeOzeyid workspace.',
    phase: 9,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/risk',
    title: 'Risk calculator',
    description:
      'Position sizing from stop-loss distance, contract size and lot step. Part of the TradeOzeyid workspace.',
    phase: 10,
    group: 'workspace',
    kind: 'placeholder',
  },
  {
    path: '/foundation',
    title: 'Foundation status',
    description:
      'Phase 1 foundation check: whether the API and the local PostgreSQL instance are answering. Kept out of the workspace navigation on purpose.',
    phase: 1,
    group: 'system',
    kind: 'health',
  },
];

/**
 * Signed-out routes (Phase 3). These are in the `public` group so they never
 * appear in the workspace navigation and never require a session.
 */
export const authRoutes: readonly AppRoute[] = [
  {
    path: '/login',
    title: 'Sign in',
    description: 'Sign in to your trading journal.',
    phase: 3,
    group: 'public',
    kind: 'auth',
  },
  {
    path: '/register',
    title: 'Create account',
    description: 'Create a TradeOzeyid account.',
    phase: 3,
    group: 'public',
    kind: 'auth',
  },
  {
    path: '/forgot-password',
    title: 'Forgot password',
    description: 'Request a password reset link.',
    phase: 3,
    group: 'public',
    kind: 'auth',
  },
  {
    path: '/reset-password',
    title: 'Reset password',
    description: 'Choose a new password.',
    phase: 3,
    group: 'public',
    kind: 'auth',
  },
];

/**
 * Areas that appear in the main workspace navigation. Nested screens such as
 * `/trades/:id` are reachable from their parent, so they are not listed here.
 */
export const workspaceRoutes = routes.filter(
  (route) => route.group === 'workspace' && !route.path.includes(':'),
);

/** Non-business entries, kept in their own navigation group. */
export const systemRoutes = routes.filter((route) => route.group === 'system');

/** Every path the router may match, including the signed-out screens. */
export const allRoutes: readonly AppRoute[] = [...routes, ...authRoutes];

export const NOT_FOUND_TITLE = 'Page not found';

/** Where an anonymous visitor is sent, and where signing in returns to. */
export const SIGN_IN_PATH = '/login';
export const HOME_PATH = '/';