import type { ReactNode } from 'react';

export type StatTrend = 'up' | 'down' | 'flat';

export interface StatTileProps {
  label: string;
  /**
   * The figure. Pass a string already produced by `formatMoney` /
   * `formatPercent` (`lib/format`) — this component never formats, so there is
   * one formatting implementation only.
   */
  value: ReactNode;
  /** Secondary line, e.g. a trade count or a period. */
  secondary?: ReactNode;
  trend?: StatTrend;
  /** Words for the trend, e.g. "up 3.2% this week". Always rendered as text. */
  trendLabel?: ReactNode;
}

const TREND_GLYPH: Record<StatTrend, string> = {
  up: '▲',
  down: '▼',
  flat: '–',
};

/**
 * Trend colour follows the trend, and the glyph above always accompanies it, so
 * the direction is never carried by colour alone (`engineering-contract.md` §8,
 * and the Phase 2 money colour rule).
 */
const TREND_COLOUR: Record<StatTrend, string> = {
  up: 'text-positive',
  down: 'text-negative',
  flat: 'text-text-muted',
};

/** A single labelled figure. */
export function StatTile({ label, value, secondary, trend, trendLabel }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-5 py-4 shadow-card">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>

      <span className="font-numeric text-2xl font-semibold text-text">{value}</span>

      {secondary ? <span className="text-xs text-text-muted">{secondary}</span> : null}

      {trend ? (
        <span className={`inline-flex items-center gap-1 text-xs ${TREND_COLOUR[trend]}`}>
          <span aria-hidden="true">{TREND_GLYPH[trend]}</span>
          {trendLabel ? <span>{trendLabel}</span> : null}
        </span>
      ) : null}
    </div>
  );
}