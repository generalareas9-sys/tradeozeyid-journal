import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Optional call to action, e.g. a `<Button>`. */
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * Shown where data would be, but there is none yet.
 *
 * A dashed edge distinguishes "nothing here yet" from "a card with content",
 * and the icon sits in a tinted accent disc rather than carrying the meaning on
 * its own.
 */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-10 text-center">
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-lg text-accent-strong"
        >
          {icon}
        </span>
      ) : null}

      <p className="text-sm font-semibold text-text">{title}</p>

      {description ? (
        <p className="max-w-sm text-sm text-text-muted">{description}</p>
      ) : null}

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}