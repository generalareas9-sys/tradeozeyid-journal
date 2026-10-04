import type { ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'accent' | 'positive' | 'negative';

export interface BadgeProps {
  variant?: BadgeVariant;
  /**
   * Optional leading glyph or icon. Colour never carries the meaning on its own:
   * the label is always rendered as text, and a caller conveying something as
   * positive or negative should also pass an icon or explicit wording.
   */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-surface text-text-muted',
  accent: 'border-transparent bg-accent-soft text-accent-strong',
  positive: 'border-transparent bg-positive-soft text-positive',
  negative: 'border-transparent bg-negative-soft text-negative',
};

/** A compact status or category label. */
export function Badge({ variant = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${VARIANTS[variant]}${
        className ? ` ${className}` : ''
      }`}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}