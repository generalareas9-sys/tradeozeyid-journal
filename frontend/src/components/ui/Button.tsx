import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Defaults to `secondary`. */
  variant?: ButtonVariant;
  /**
   * Shows a spinner and blocks interaction. The label stays in the DOM, so the
   * accessible name is unchanged; `aria-busy` announces the pending state.
   */
  loading?: boolean;
  /** Contents rendered before the label, e.g. a leading glyph. */
  leading?: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm ' +
  'font-medium transition-colors focus:outline-none focus-visible:ring-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  // `accent` is a fill colour; white text on it measures 5.71:1.
  primary: 'border-transparent bg-accent text-white hover:bg-accent-strong',
  // An interactive control, so its edge uses `border-strong` (3.26:1), not the
  // decorative `border`.
  secondary:
    'border-border-strong bg-surface text-text hover:border-accent hover:bg-accent-soft hover:text-accent-strong',
  ghost: 'border-transparent bg-transparent text-text-muted hover:bg-accent-soft hover:text-text',
  danger: 'border-transparent bg-negative text-white hover:opacity-90',
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/** The action primitive. Always a real `<button>` so keyboard and form behaviour is native. */
export function Button({
  variant = 'secondary',
  loading = false,
  leading,
  disabled = false,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]}${className ? ` ${className}` : ''}`}
    >
      {loading ? <Spinner /> : leading}
      {children}
    </button>
  );
}