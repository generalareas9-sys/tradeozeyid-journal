import type { ReactNode } from 'react';
import { Badge } from '../../../components/ui/Badge';

/**
 * Shared frame for the signed-out screens.
 *
 * Reuses the existing primitives rather than restyling anything, so the auth
 * screens sit in the approved light-and-purple system automatically.
 */
export function AuthLayout({
  title,
  subtitle,
  badge,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-10">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent"
        >
          <span className="h-3.5 w-3.5 rounded-sm bg-white" />
        </span>
        <span className="text-base font-semibold tracking-tight text-text">TradeOzeyid</span>
      </div>

      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex flex-col gap-2 border-b border-border px-6 py-5">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-text">{title}</h1>
              {badge ? <Badge variant="accent">{badge}</Badge> : null}
            </div>
            <p className="text-sm leading-relaxed text-text-muted">{subtitle}</p>
          </div>

          <div className="flex flex-col gap-4 px-6 py-6">{children}</div>

          {footer ? (
            <div className="border-t border-border bg-background px-6 py-4 text-sm text-text-muted">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A non-field-specific error banner.
 *
 * `role="alert"` so it interrupts a screen reader, and the message is the
 * server's own wording — `INVALID_CREDENTIALS` is deliberately vague, and
 * inventing detail here would create an enumeration signal the API avoids.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-lg border border-negative bg-negative-soft px-3 py-2 text-sm font-medium text-negative"
    >
      {message}
    </p>
  );
}

/**
 * A form-level notice, used where the API deliberately returns the same neutral
 * message whether or not an account exists.
 */
export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p
      role="status"
      className="rounded-lg border border-positive bg-positive-soft px-3 py-2 text-sm font-medium text-positive"
    >
      {message}
    </p>
  );
}