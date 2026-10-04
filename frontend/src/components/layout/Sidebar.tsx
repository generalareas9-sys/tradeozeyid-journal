import type { MouseEvent } from 'react';
import { navigate } from '../../app/router';
import { systemRoutes, workspaceRoutes } from './routeConfig';
import type { AppRoute } from './routeConfig';

export interface SidebarProps {
  /** Pathname of the page currently shown. */
  pathname: string;
  /** Called after a link is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** Rendered as the drawer's close control; omitted on the desktop sidebar. */
  onClose?: () => void;
}

function NavLink({
  route,
  active,
  onNavigate,
}: {
  route: AppRoute;
  active: boolean;
  onNavigate?: () => void;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Keep a real href for middle-click and "open in new tab", but route
    // in place for ordinary clicks.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;

    event.preventDefault();
    navigate(route.path);
    onNavigate?.();
  }

  return (
    <li>
      <a
        href={route.path}
        onClick={handleClick}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 ${
          active
            ? 'bg-accent-soft text-accent-strong'
            : 'text-text-muted hover:bg-background hover:text-text'
        }`}
      >
        {/* Active state is carried by aria-current and by the tinted fill plus the
            left rule, never by colour alone. */}
        <span
          aria-hidden="true"
          className={`h-4 w-1 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`}
        />
        <span className="truncate">{route.title}</span>
      </a>
    </li>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: readonly AppRoute[];
  pathname: string;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label}>
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((route) => (
          <NavLink
            key={route.path}
            route={route}
            active={route.path === pathname}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </nav>
  );
}

/**
 * The workspace navigation.
 *
 * White on the lavender canvas, separated by a vertical rule rather than a
 * shadow. Every link state is legible at rest: the inactive colour is
 * `text-muted` at 6.98:1, not a hover-only reveal.
 */
export function Sidebar({ pathname, onNavigate, onClose }: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-6 bg-surface px-4 py-5">
      <div className="flex items-center justify-between gap-2">
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate('/');
            onNavigate?.();
          }}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1 focus:outline-none focus-visible:ring-2"
        >
          {/* Original TradeOzeyid mark: a rounded accent tile with a lighter
              inner square. Not derived from any third-party logo. */}
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent"
          >
            <span className="h-3 w-3 rounded-sm bg-white" />
          </span>
          <span className="text-base font-semibold tracking-tight text-text">TradeOzeyid</span>
        </a>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-background hover:text-text focus:outline-none focus-visible:ring-2"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close navigation</span>
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 overflow-y-auto">
        <NavGroup label="Workspace" items={workspaceRoutes} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="System" items={systemRoutes} pathname={pathname} onNavigate={onNavigate} />
      </div>

      <p className="mt-auto px-3 text-xs leading-relaxed text-text-muted">
        Phase 2
        <br />
        Design system and application shell
      </p>
    </div>
  );
}