import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Controls placed in the header, opposite the title. */
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A surface grouping related content, optionally with a header and footer.
 *
 * White on a light lavender canvas with a subtle edge and a restrained, tinted
 * shadow. `border` is decorative here, which is why the card may stay subtle;
 * interactive controls inside use `border-strong` instead.
 */
export function Card({ title, subtitle, actions, footer, children, className }: CardProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <section
      className={`overflow-hidden rounded-xl border border-border bg-card shadow-card${
        className ? ` ${className}` : ''
      }`}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex flex-col gap-1">
            {title !== undefined ? <h2 className="text-sm font-semibold text-text">{title}</h2> : null}
            {subtitle !== undefined ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
          </div>

          {actions !== undefined ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      <div className="px-5 py-5">{children}</div>

      {footer !== undefined ? (
        <footer className="border-t border-border bg-background px-5 py-3 text-xs text-text-muted">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}