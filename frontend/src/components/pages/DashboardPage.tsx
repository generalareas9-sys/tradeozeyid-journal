import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Table } from '../ui/Table';

export interface DashboardPageProps {
  /** Phase of `docs/phase-plan.md` that delivers the real dashboard. */
  phase: number;
  /** What the dashboard will hold, from the locked documentation. */
  description: string;
}

/**
 * Metric slots shown while the dashboard has no data.
 *
 * The labels are the metrics `docs/phase-plan.md` Phase 8 delivers from
 * `GET /dashboard`; the expectancy and profit-factor wording comes from the
 * formulas in `docs/database-schema.md` §5. There are deliberately no figures:
 * a fabricated balance or return on a trading screen reads as real data.
 */
const METRIC_SLOTS = [
  { label: 'Net P&L', note: 'Net result across closed trades, in account currency.' },
  { label: 'Expectancy', note: 'Average result per trade, weighted by win and loss size.' },
  { label: 'Profit factor', note: 'Gross profit against gross loss.' },
  { label: 'Max drawdown', note: 'Deepest peak-to-trough fall in equity.' },
] as const;

/**
 * Column set for the recent-trades feed. Every numeric column is right-aligned so
 * digits line up; the values arrive in Phase 5 and are rendered by
 * `lib/format`, never by this component.
 */
const RECENT_TRADE_HEADERS = ['Date', 'Symbol', 'Side', 'Lots', 'Entry', 'Stop loss', 'Net P&L'];

const RECENT_TRADE_ALIGN = ['left', 'left', 'left', 'right', 'right', 'right', 'right'] as const;

/**
 * The Phase 2 dashboard placeholder.
 *
 * It has the shape a trading journal dashboard is expected to have — headline
 * metrics, an equity curve, a drawdown card, the recent-trades feed, a calendar
 * heatmap and a session breakdown — with every region in an honest empty state
 * that names the phase which fills it. No sample prices, balances or returns are
 * rendered anywhere.
 *
 * The page holds no `h1`: the top bar owns the single `h1` for the route.
 */
export function DashboardPage({ phase, description }: DashboardPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-text-muted">{description}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Dashboard arrives in Phase {phase}</Badge>
          <Badge variant="neutral">No trading data recorded yet</Badge>
        </div>
      </header>

      <section aria-labelledby="dashboard-metrics" className="flex flex-col gap-3">
        <h2 id="dashboard-metrics" className="text-sm font-semibold text-text">
          Key metrics
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {METRIC_SLOTS.map((slot) => (
            <div
              key={slot.label}
              className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border-strong bg-card px-5 py-4"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {slot.label}
              </span>

              {/* The dash is decoration; the real state is announced as text. */}
              <span aria-hidden="true" className="font-numeric text-2xl font-semibold leading-none text-border-strong">
                &mdash;
              </span>
              <span className="sr-only">No data yet</span>

              <span className="text-xs leading-relaxed text-text-muted">{slot.note}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Equity curve"
          subtitle="Account equity over time"
          className="lg:col-span-2"
        >
          <EmptyState
            title="No equity curve yet"
            description="The curve is plotted from recorded trades, so nothing is drawn until the journal has entries. No sample line is shown in the meantime."
          />
        </Card>

        <Card title="Drawdown" subtitle="Deepest fall from a previous equity peak">
          <EmptyState
            title="No drawdown data yet"
            description="Drawdown is derived from the equity curve, so it arrives at the same time."
          />
        </Card>
      </div>

      <section aria-labelledby="dashboard-recent-trades" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="dashboard-recent-trades" className="text-sm font-semibold text-text">
            Recent trades
          </h2>
          <p className="text-xs text-text-muted">
            The latest entries in the journal. Trades are recorded in the Trades area.
          </p>
        </div>

        <Table
          headers={[...RECENT_TRADE_HEADERS]}
          align={[...RECENT_TRADE_ALIGN]}
          empty={
            /* Not an `EmptyState`: that component draws a dashed edge, which
               would read as a second border inside the table's own frame. A
               table cell states its emptiness with centred text instead. */
            <div className="mx-auto flex max-w-sm flex-col gap-1">
              <p className="text-sm font-semibold text-text">No trades recorded</p>
              <p className="text-sm text-text-muted">
                Your journal is empty, so there is nothing to list here.
              </p>
            </div>
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Calendar heatmap"
          subtitle="Daily result for each calendar day"
          className="lg:col-span-2"
        >
          <EmptyState
            title="No calendar yet"
            description="Each day is shaded by its result once trades exist. Days are grouped by your account timezone."
          />
        </Card>

        <Card title="By session" subtitle="London, New York, Tokyo and Sydney">
          <EmptyState
            title="No session breakdown yet"
            description="A session is assigned from the UTC time of the entry, so results are comparable across timezones."
          />
        </Card>
      </div>
    </div>
  );
}