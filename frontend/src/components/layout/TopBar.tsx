import type { RefObject } from 'react';
import { Button } from '../ui/Button';

export interface TopBarProps {
  /** Current page title, rendered as the page's single `h1`. */
  pageTitle: string;
  /** Whether the mobile navigation drawer is open. */
  navigationOpen: boolean;
  onToggleNavigation: () => void;
  /** The toggle button, so the shell can restore focus after Escape. */
  toggleRef: RefObject<HTMLButtonElement>;
  /**
   * Signed-in user's display name. Absent while signed out, and absent in the
   * Phase 2 shell tests, which exercise the bar without a session.
   */
  displayName?: string | null;
  /** Provided only when there is a session; its presence is what shows the control. */
  onSignOut?: () => void;
  /** Blocks a second sign-out while the first is still in flight. */
  signingOut?: boolean;
}

/**
 * The top bar: page title, the mobile navigation toggle, the trading account
 * selector placeholder, and the sign-out control.
 *
 * The account selector is deliberately inert. `docs/phase-plan.md` Phase 4
 * delivers the "account list, create/edit dialog, archive, default switcher in the
 * top bar", and Phase 1 has no accounts endpoint, so no request is made and the
 * control is disabled with a hint that says when it becomes real.
 *
 * Sign-out is the one account-scoped action Phase 3 does deliver, so it sits here
 * rather than in the sidebar: it is the way out of the workspace, not a place in it.
 */
export function TopBar({
  pageTitle,
  navigationOpen,
  onToggleNavigation,
  toggleRef,
  displayName,
  onSignOut,
  signingOut = false,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          ref={toggleRef}
          type="button"
          onClick={onToggleNavigation}
          aria-expanded={navigationOpen}
          aria-controls="app-navigation"
          className="rounded-lg border border-border-strong px-2.5 py-1.5 text-sm text-text-muted hover:border-accent hover:text-accent-strong focus:outline-none focus-visible:ring-2 lg:hidden"
        >
          <span aria-hidden="true">☰</span>
          {/* Constant name: the open/closed state is carried by aria-expanded,
              which also keeps this name unique against the drawer's own
              "Close navigation" button. */}
          <span className="sr-only">Navigation menu</span>
        </button>

        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-text sm:text-lg">
          {pageTitle}
        </h1>

        {/* Stacks at 390px so the selector never crowds the title. The label is
            `sr-only` rather than `display:none` on mobile: it stays the select's
            accessible name, which is why it is hidden visually and not removed
            from the accessibility tree. */}
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
          {onSignOut ? (
            <div className="flex items-center gap-2">
              {/* Hidden visually below `sm` so a 390px screen keeps the title
                  readable; the sign-out control itself always stays. */}
              {displayName ? (
                <span className="hidden max-w-[10rem] truncate text-sm text-text-muted sm:inline">
                  {displayName}
                </span>
              ) : null}

              <Button variant="ghost" onClick={onSignOut} loading={signingOut}>
                Sign out
              </Button>
            </div>
          ) : null}

          <label
            htmlFor="account-selector"
            className="sr-only text-xs font-medium text-text-muted sm:not-sr-only"
          >
            Trading account
          </label>
          <select
            id="account-selector"
            disabled
            aria-describedby="account-selector-hint"
            className="w-full max-w-[12rem] rounded-lg border border-border-strong bg-background px-2.5 py-1.5 text-sm text-text-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <option>None selected</option>
          </select>
          <p id="account-selector-hint" className="text-xs text-text-muted">
            Arrives in Phase 4
          </p>
        </div>
      </div>
    </header>
  );
}