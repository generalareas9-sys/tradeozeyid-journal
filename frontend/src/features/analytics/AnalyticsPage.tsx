import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import type {
  DashboardResource,
  AnalyticsBreakdownResponse,
  StreaksResource,
  SessionsResource,
  AnalyticsDimension,
  BreakdownItemResource,
} from '@tradeozeyid/contracts';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { StatTile } from '../../components/ui/StatTile';
import { formatMoney, formatPercent } from '../../lib/format';

const DIMENSIONS: { key: AnalyticsDimension; label: string }[] = [
  { key: 'strategy', label: 'Strategy' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'session', label: 'Session' },
  { key: 'direction', label: 'Direction' },
  { key: 'tag', label: 'Tag' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'dayOfWeek', label: 'Day of Week' },
  { key: 'timeOfDay', label: 'Time of Day' },
  { key: 'riskBucket', label: 'Risk Bucket' },
  { key: 'streak', label: 'Streak' },
  { key: 'emotion', label: 'Emotion' },
];

function formatR(value: string): string {
  const num = parseFloat(value);
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

function getTrend(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

const BREAKDOWN_HEADERS = [
  'Key',
  'Trades',
  'Closed',
  'Net P&L',
  'Win Rate',
  'Profit Factor',
  'Avg R',
  'Avg Win',
  'Avg Loss',
];

const BREAKDOWN_ALIGN: Array<'left' | 'right' | 'center'> = ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'];

const STREAK_HEADERS = ['Start', 'End', 'Length', 'P&L'];
const STREAK_ALIGN: Array<'left' | 'right' | 'center'> = ['left', 'left', 'right', 'right'];

const SESSION_HEADERS = ['Session', 'Trades', 'Net P&L', 'Win Rate'];
const SESSION_ALIGN: Array<'left' | 'right' | 'center'> = ['left', 'right', 'right', 'right'];

export function AnalyticsPage() {
  const [dashboard, setDashboard] = useState<DashboardResource | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownItemResource[]>([]);
  const [streaks, setStreaks] = useState<StreaksResource | null>(null);
  const [sessions, setSessions] = useState<SessionsResource | null>(null);
  const [activeDimension, setActiveDimension] = useState<AnalyticsDimension>('strategy');
  const [loading, setLoading] = useState(true);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchDashboard() {
    try {
      const data = await apiRequest<DashboardResource>('/dashboard');
      setDashboard(data);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
      setError('Failed to load dashboard');
    }
  }

  async function fetchBreakdown(dimension: AnalyticsDimension) {
    setBreakdownLoading(true);
    try {
      const params = new URLSearchParams({ dimension });
      const data = await apiRequest<AnalyticsBreakdownResponse>(`/analytics/breakdown?${params.toString()}`);
      setBreakdown(data.data);
      setActiveDimension(dimension);
    } catch (err) {
      console.error('Failed to fetch breakdown:', err);
      setError('Failed to load breakdown');
    } finally {
      setBreakdownLoading(false);
    }
  }

  async function fetchStreaks() {
    try {
      const data = await apiRequest<StreaksResource>('/analytics/streaks');
      setStreaks(data);
    } catch (err) {
      console.error('Failed to fetch streaks:', err);
    }
  }

  async function fetchSessions() {
    try {
      const data = await apiRequest<SessionsResource>('/analytics/sessions');
      setSessions(data);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);
      await Promise.all([fetchDashboard(), fetchStreaks(), fetchSessions()]);
      await fetchBreakdown('strategy');
      setLoading(false);
    }
    loadAll();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-live="polite">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Loading..." value="—" />
          <StatTile label="Loading..." value="—" />
          <StatTile label="Loading..." value="—" />
          <StatTile label="Loading..." value="—" />
        </div>
        <Card>
          <p className="text-center text-text-muted py-8">Loading analytics…</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-negative">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text hover:bg-surface transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const currency = dashboard?.metrics.currency ?? 'USD';

  return (
    <div className="space-y-6">
      {dashboard && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Net P&L"
            value={formatMoney(dashboard.metrics.netPnl, currency)}
            trend={getTrend(parseFloat(dashboard.metrics.netPnl))}
          />
          <StatTile
            label="Win Rate"
            value={formatPercent(dashboard.metrics.winRate)}
            trend={getTrend(dashboard.metrics.winRate - 50)}
          />
          <StatTile
            label="Profit Factor"
            value={dashboard.metrics.profitFactor ?? '—'}
            trend={dashboard.metrics.profitFactor && parseFloat(dashboard.metrics.profitFactor) > 1 ? 'up' : 'down'}
          />
          <StatTile
            label="Avg R"
            value={formatR(dashboard.metrics.averageR)}
            trend={getTrend(parseFloat(dashboard.metrics.averageR))}
          />
          <StatTile
            label="Total Trades"
            value={dashboard.metrics.totalTrades.toString()}
          />
          <StatTile
            label="Closed Trades"
            value={dashboard.metrics.closedTrades.toString()}
          />
          <StatTile
            label="Max Drawdown"
            value={`${dashboard.metrics.maxDrawdownPercent.toFixed(2)}%`}
            trend="down"
          />
          <StatTile
            label="Total R"
            value={formatR(dashboard.metrics.totalR)}
            trend={getTrend(parseFloat(dashboard.metrics.totalR))}
          />
        </div>
      )}

      <Tabs
        tabs={DIMENSIONS.map(d => ({ id: d.key, label: d.label }))}
        activeId={activeDimension}
        onChange={(id) => fetchBreakdown(id as AnalyticsDimension)}
        label="Analytics dimensions"
      >
        {breakdownLoading ? (
          <div className="text-center py-8 text-text-muted" role="status" aria-live="polite">
            Loading {DIMENSIONS.find(d => d.key === activeDimension)?.label.toLowerCase()} breakdown…
          </div>
        ) : (
          <Card>
            <Table headers={BREAKDOWN_HEADERS} align={BREAKDOWN_ALIGN} empty="No data for this dimension">
              {breakdown.length === 0 ? null : breakdown.map((item) => (
                <tr key={item.key}>
                  <td className="font-mono text-sm">{item.key}</td>
                  <td className="text-right text-sm">{item.tradeCount}</td>
                  <td className="text-right text-sm">{item.closedTrades}</td>
                  <td className="text-right font-mono text-sm">
                    <span className={parseFloat(item.netPnl) >= 0 ? 'text-positive' : 'text-negative'}>
                      {formatMoney(item.netPnl, currency)}
                    </span>
                  </td>
                  <td className="text-right text-sm">
                    {formatPercent(item.winRate)}
                    <span className="text-text-muted text-xs"> ({item.closedTrades > 0 ? Math.round((item.winRate / 100) * item.closedTrades) : 0}/{item.closedTrades})</span>
                  </td>
                  <td className="text-right font-mono text-sm">
                    {item.profitFactor ? parseFloat(item.profitFactor).toFixed(2) : '—'}
                  </td>
                  <td className="text-right font-mono text-sm">
                    {formatR(item.averageR)}
                  </td>
                  <td className="text-right font-mono text-sm text-positive">
                    {formatMoney(item.averageWin, currency)}
                  </td>
                  <td className="text-right font-mono text-sm text-negative">
                    {formatMoney(item.averageLoss, currency)}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </Tabs>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-text">Streaks</h2>
          {streaks && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <StatTile
                  label="Current Win Streak"
                  value={streaks.currentWinStreak.toString()}
                  trend={streaks.currentWinStreak > 0 ? 'up' : 'flat'}
                />
                <StatTile
                  label="Current Loss Streak"
                  value={streaks.currentLossStreak.toString()}
                  trend={streaks.currentLossStreak > 0 ? 'down' : 'flat'}
                />
                <StatTile
                  label="Max Drawdown Streak"
                  value={streaks.maxDrawdownStreak.toString()}
                  trend="down"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <StatTile
                  label="Max Win Streak"
                  value={streaks.maxWinStreak.toString()}
                  trend="up"
                />
                <StatTile
                  label="Max Loss Streak"
                  value={streaks.maxLossStreak.toString()}
                  trend="down"
                />
              </div>
              {streaks.winStreakHistory.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-text-muted">Recent Win Streaks</h3>
                  <Table headers={STREAK_HEADERS} align={STREAK_ALIGN} empty="No win streaks">
                    {streaks.winStreakHistory.slice(-5).map((s, i) => (
                      <tr key={i}>
                        <td className="text-sm">{s.start}</td>
                        <td className="text-sm">{s.end}</td>
                        <td className="text-right text-sm">{s.length}</td>
                        <td className="text-right font-mono text-sm text-positive">{formatMoney(s.pnl, currency)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
              {streaks.lossStreakHistory.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-text-muted">Recent Loss Streaks</h3>
                  <Table headers={STREAK_HEADERS} align={STREAK_ALIGN} empty="No loss streaks">
                    {streaks.lossStreakHistory.slice(-5).map((s, i) => (
                      <tr key={i}>
                        <td className="text-sm">{s.start}</td>
                        <td className="text-sm">{s.end}</td>
                        <td className="text-right text-sm">{s.length}</td>
                        <td className="text-right font-mono text-sm text-negative">{formatMoney(s.pnl, currency)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-text">Sessions & Hours</h2>
          {sessions && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-text-muted">By Session</h3>
              <Table headers={SESSION_HEADERS} align={SESSION_ALIGN} empty="No session data">
                {sessions.bySession.map((s) => (
                  <tr key={s.key}>
                    <td className="capitalize text-sm">{s.key}</td>
                    <td className="text-right text-sm">{s.tradeCount}</td>
                    <td className="text-right font-mono text-sm">
                      <span className={parseFloat(s.pnl) >= 0 ? 'text-positive' : 'text-negative'}>
                        {formatMoney(s.pnl, currency)}
                      </span>
                    </td>
                    <td className="text-right text-sm">{formatPercent(s.winRate)}</td>
                  </tr>
                ))}
              </Table>

              <h3 className="mt-4 text-sm font-medium text-text-muted">By Hour (UTC)</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {sessions.byHour.filter(h => h.tradeCount > 0).map((h) => (
                  <div key={h.hour} className="p-3 rounded-lg bg-card border border-border">
                    <div className="text-xs font-medium text-text-muted">{h.hour.toString().padStart(2, '0')}:00</div>
                    <div className="text-sm font-mono">
                      <span className={parseFloat(h.netPnl) >= 0 ? 'text-positive' : 'text-negative'}>
                        {formatMoney(h.netPnl, currency)}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted">{h.tradeCount} trades • {formatPercent(h.winRate)} WR</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}