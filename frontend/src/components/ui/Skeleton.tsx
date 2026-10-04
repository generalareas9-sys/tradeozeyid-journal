import type { ReactNode } from 'react';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Tailwind width utility, e.g. `w-1/2`. Defaults per variant. */
  width?: string;
  /** Tailwind height utility, e.g. `h-4`. Defaults per variant. */
  height?: string;
  className?: string;
}

/**
 * Tints, not borders. On a light surface a skeleton is a filled shape, so it
 * uses `accent-soft` over `background` — decorative, and never carrying meaning.
 */
const SHAPES: Record<SkeletonVariant, { base: string; width: string; height: string }> = {
  text: { base: 'rounded bg-accent-soft', width: 'w-full', height: 'h-4' },
  rect: { base: 'rounded-lg bg-accent-soft', width: 'w-full', height: 'h-24' },
  circle: { base: 'rounded-full bg-accent-soft', width: 'w-8', height: 'h-8' },
};

/**
 * A decorative loading placeholder.
 *
 * Hidden from assistive technology by default, because a shape carries no
 * meaning. Wrap a group in {@link SkeletonGroup} when the loading state itself
 * should be announced.
 */
export function Skeleton({ variant = 'text', width, height, className }: SkeletonProps) {
  const shape = SHAPES[variant];

  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse ${shape.base} ${width ?? shape.width} ${
        height ?? shape.height
      }${className ? ` ${className}` : ''}`}
    />
  );
}

/** Repeated lines, for a list or a paragraph. */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          variant="text"
          width={index === count - 1 ? 'w-2/3' : 'w-full'}
        />
      ))}
    </div>
  );
}

/**
 * Announces that content is loading, then contains the decorative skeletons.
 * The label is spoken; the shapes inside are not.
 */
export function SkeletonGroup({ label = 'Loading', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}