import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export interface AppShellProps {
  /** Current page title, shown in the top bar as the page's `h1`. */
  pageTitle: string;
  /** Pathname of the current page, used to mark the active navigation item. */
  pathname: string;
  children: ReactNode;
  /** Signed-in display name, shown beside the sign-out control. */
  displayName?: string | null;
  /** Omitted when there is no session; its presence is what shows the control. */
  onSignOut?: () => void;
  /** Blocks a second sign-out while the first is in flight. */
  signingOut?: boolean;
}

const MOBILE_NAVIGATION_ID = 'app-navigation';
const MAIN_ID = 'main-content';

/**
 * The application shell: persistent sidebar, top bar and a single content
 * region that pages render into.
 *
 * Responsive behaviour uses Tailwind breakpoints only, with no width sniffing:
 *  - from `lg` up the sidebar is a permanent 16rem column and the drawer copy is
 *    never rendered, so navigation never eats content width on a desktop;
 *  - below `lg` the sidebar is an overlay drawer that leaves the layout
 *    entirely when closed, so a 390px phone keeps its full width for content.
 */
export function AppShell({
  pageTitle,
  pathname,
  children,
  displayName,
  onSignOut,
  signingOut = false,
}: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the drawer and returns focus to the control that opened it.
  useEffect(() => {
    if (!navigationOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      setNavigationOpen(false);
      toggleRef.current?.focus();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigationOpen]);

  return (
    <div className="min-h-screen bg-background">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      {/* Permanent desktop sidebar. */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64 lg:border-r lg:border-border">
        <div className="h-full overflow-y-auto">
          <Sidebar pathname={pathname} />
        </div>
      </div>

      {/* Temporary mobile drawer: only in the layout while it is open. */}
      {navigationOpen ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          {/* Presentational click-catcher, deliberately not a focusable control:
              the drawer's close button and the Escape key are the accessible
              ways to dismiss, so exposing this would announce "Close
              navigation" twice. */}
          <div
            data-testid="navigation-backdrop"
            aria-hidden="true"
            onClick={() => setNavigationOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-text opacity-40"
          />
          <div
            id={MOBILE_NAVIGATION_ID}
            className="relative h-full w-72 max-w-[85%] overflow-y-auto border-r border-border bg-surface shadow-card"
          >
            <Sidebar
              pathname={pathname}
              onNavigate={() => setNavigationOpen(false)}
              onClose={() => setNavigationOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <TopBar
          pageTitle={pageTitle}
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen((open) => !open)}
          toggleRef={toggleRef}
          displayName={displayName}
          onSignOut={onSignOut}
          signingOut={signingOut}
        />

        <main id={MAIN_ID} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}