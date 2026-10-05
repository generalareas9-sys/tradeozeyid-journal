import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { usePathname, navigate } from '../../app/router';
import type { TradeFilter } from '@tradeozeyid/contracts';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  DatePicker,
  Tabs,
  Badge,
  EmptyState,
  Skeleton,
} from '../../components/ui';
import { formatMoney, formatPercent } from '../../lib/format';
import { useToast } from '../../components/ui/Toast';

const REPORT_TYPES = [
  { id: 'performance', label: 'Performance', description: 'Overview of trading performance metrics' },
  { id: 'risk', label: 'Risk', description: 'Risk analysis and drawdown details' },
  { id: 'strategies', label: 'Strategies', description: 'Performance by strategy' },
  { id: 'sessions', label: 'Sessions', description: 'Performance by market session' },
  { id: 'calendar', label: 'Calendar', description: 'Daily P&L calendar heatmap' },
  { id: 'symbol', label: 'Symbol', description: 'Performance by trading symbol' },
  { id: 'direction', label: 'Direction', description: 'Long vs Short performance' },
  { id: 'tag', label: 'Tag', description: 'Performance by tag' },
] as const;

type ReportType = typeof REPORT_TYPES[number]['id'];

const EXPORT_COLUMNS = [
  { id: 'id', label: 'Trade ID' },
  { id: 'accountId', label: 'Account ID' },
  { id: 'accountName', label: 'Account' },
  { id: 'symbol', label: 'Symbol' },
  { id: 'direction', label: 'Direction' },
  { id: 'status', label: 'Status' },
  { id: 'session', label: 'Session' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'entryPrice', label: 'Entry Price' },
  { id: 'exitPrice', label: 'Exit Price' },
  { id: 'stopLoss', label: 'Stop Loss' },
  { id: 'takeProfit', label: 'Take Profit' },
  { id: 'entryTime', label: 'Entry Time (UTC)' },
  { id: 'exitTime', label: 'Exit Time (UTC)' },
  { id: 'contractSize', label: 'Contract Size' },
  { id: 'plannedRisk', label: 'Planned Risk' },
  { id: 'riskPercent', label: 'Risk %' },
  { id: 'fees', label: 'Fees' },
  { id: 'swap', label: 'Swap' },
  { id: 'pnl', label: 'P&L' },
  { id: 'rMultiple', label: 'R Multiple' },
  { id: 'mae', label: 'MAE' },
  { id: 'mfe', label: 'MFE' },
  { id: 'title', label: 'Title' },
  { id: 'mistake', label: 'Mistake' },
  { id: 'followedPlan', label: 'Followed Plan' },
  { id: 'brokeRules', label: 'Broke Rules' },
  { id: 'strategyName', label: 'Strategy' },
  { id: 'tags', label: 'Tags' },
  { id: 'durationMinutes', label: 'Duration (min)' },
  { id: 'createdAt', label: 'Created At (UTC)' },
  { id: 'updatedAt', label: 'Updated At (UTC)' },
] as const;

type ExportColumn = typeof EXPORT_COLUMNS[number]['id'];

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const DIRECTION_OPTIONS = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
];

const SESSION_OPTIONS = [
  { value: 'sydney', label: 'Sydney' },
  { value: 'tokyo', label: 'Tokyo' },
  { value: 'london', label: 'London' },
  { value: 'new_york', label: 'New York' },
];

const DEFAULT_COLUMNS: ExportColumn[] = [
  'symbol',
  'direction',
  'entryTime',
  'exitTime',
  'entryPrice',
  'exitPrice',
  'stopLoss',
  'takeProfit',
  'quantity',
  'pnl',
  'rMultiple',
  'fees',
  'swap',
  'status',
  'session',
  'strategyName',
  'tags',
];

function parseFiltersFromUrl(searchParams: URLSearchParams): TradeFilter {
  const filters: TradeFilter = {};

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from) filters.from = from;
  if (to) filters.to = to;

  const accountId = searchParams.get('accountId');
  if (accountId) filters.accountId = accountId;

  const symbols = searchParams.getAll('symbol');
  if (symbols.length) filters.symbol = symbols;

  const directions = searchParams.getAll('direction');
  if (directions.length) filters.direction = directions as TradeFilter['direction'];

  const strategyIds = searchParams.getAll('strategyId');
  if (strategyIds.length) filters.strategyId = strategyIds;

  const tagIds = searchParams.getAll('tagId');
  if (tagIds.length) filters.tagId = tagIds;

  const sessions = searchParams.getAll('session');
  if (sessions.length) filters.session = sessions as TradeFilter['session'];

  const statuses = searchParams.getAll('status');
  if (statuses.length) filters.status = statuses as TradeFilter['status'];

  const minR = searchParams.get('minR');
  if (minR) filters.minR = minR;

  const maxR = searchParams.get('maxR');
  if (maxR) filters.maxR = maxR;

  const minPnl = searchParams.get('minPnl');
  if (minPnl) filters.minPnl = minPnl;

  const maxPnl = searchParams.get('maxPnl');
  if (maxPnl) filters.maxPnl = maxPnl;

  const emotionTagId = searchParams.get('emotionTagId');
  if (emotionTagId) filters.emotionTagId = emotionTagId;

  const brokeRules = searchParams.get('brokeRules');
  if (brokeRules) filters.brokeRules = brokeRules === 'true';

  const hasAttachments = searchParams.get('hasAttachments');
  if (hasAttachments) filters.hasAttachments = hasAttachments === 'true';

  const q = searchParams.get('q');
  if (q) filters.q = q;

  const timezone = searchParams.get('timezone');
  if (timezone) filters.timezone = timezone;

  return filters;
}

function filtersToUrlParams(filters: TradeFilter): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (Array.isArray(value)) {
      value.forEach(v => params.append(key, v));
    } else if (typeof value === 'boolean') {
      params.set(key, value ? 'true' : 'false');
    } else {
      params.set(key, String(value));
    }
  });

  return params;
}

function getTrend(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

export function ReportsPage() {
  const pathname = usePathname();
  const { toast } = useToast();
  const [reportType, setReportType] = useState<ReportType>('performance');
  const [filters, setFilters] = useState<TradeFilter>({});
  const [selectedColumns, setSelectedColumns] = useState<ExportColumn[]>(DEFAULT_COLUMNS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<{
    netPnl: string;
    winRate: number;
    lossRate: number;
    profitFactor: string | null;
    averageR: string;
    totalTrades: number;
    closedTrades: number;
    openTrades: number;
    bestTrade: string;
    worstTrade: string;
    averageWin: string;
    averageLoss: string;
    maxDrawdownPercent: number;
    maxDrawdownAmount: string;
    totalR: string;
    currency: string;
  } | null>(null);

  const [breakdown, setBreakdown] = useState<Array<{
    key: string;
    secondaryKey: string | null;
    tradeCount: number;
    closedTrades: number;
    netPnl: string;
    winRate: number;
    profitFactor: string | null;
    averageR: string;
    averageWin: string;
    averageLoss: string;
  }>>([]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const metricData = await apiRequest('/analytics/summary', { method: 'GET' });
      setMetrics(metricData);

      const breakdownData = await apiRequest('/analytics/breakdown', {
        method: 'GET',
        body: undefined,
      });
      setBreakdown(breakdownData.data);
    } catch (err) {
      console.error('Failed to load report:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlFilters = parseFiltersFromUrl(searchParams);
    setFilters(urlFilters);

    const urlReportType = searchParams.get('reportType') as ReportType | null;
    if (urlReportType && REPORT_TYPES.some(rt => rt.id === urlReportType)) {
      setReportType(urlReportType);
    }

    loadReport();
  }, [loadReport]);

  const handleFilterChange = (key: keyof TradeFilter, value: TradeFilter[keyof TradeFilter]) => {
    setFilters(prev => {
      const next = { ...prev };
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = filtersToUrlParams(filters);
    params.set('reportType', reportType);
    navigate(`/reports?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setFilters({});
    navigate(`/reports?reportType=${reportType}`);
  };

  const handleColumnToggle = (columnId: ExportColumn) => {
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(c => c !== columnId)
        : [...prev, columnId]
    );
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/v1/analytics/trades/export', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (() => {
            const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
            return match?.[1] ? decodeURIComponent(match[1]) : '';
          })(),
        },
        body: JSON.stringify({
          format: 'csv',
          columns: selectedColumns,
          filters,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message ?? 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? `trades-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Export complete', description: `${filename} downloaded`, variant: 'success' });
    } catch (err) {
      console.error('Export failed:', err);
      toast({ title: 'Export failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleReportTypeChange = (type: ReportType) => {
    setReportType(type);
    const params = filtersToUrlParams(filters);
    params.set('reportType', type);
    navigate(`/reports?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-live="polite">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
        <Card>
          <SkeletonLines count={5} />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-negative">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const currency = metrics?.currency ?? 'USD';
  const activeReport = REPORT_TYPES.find(rt => rt.id === reportType)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text">Reports</h1>
          <p className="text-text-muted">{activeReport.description}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} loading={exporting} disabled={exporting}>
            Export CSV
          </Button>
        </div>
      </div>

      <form onSubmit={handleFilterSubmit} className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="from" className="block text-sm font-medium text-text-muted mb-1">
                From Date
              </label>
              <DatePicker
                id="from"
                value={filters.from ?? ''}
                onChange={v => handleFilterChange('from', v)}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="to" className="block text-sm font-medium text-text-muted mb-1">
                To Date
              </label>
              <DatePicker
                id="to"
                value={filters.to ?? ''}
                onChange={v => handleFilterChange('to', v)}
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="symbol" className="block text-sm font-medium text-text-muted mb-1">
                Symbol
              </label>
              <Input
                id="symbol"
                value={Array.isArray(filters.symbol) ? filters.symbol.join(', ') : filters.symbol ?? ''}
                onChange={e => handleFilterChange('symbol', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="XAUUSDc, EURUSD"
              />
            </div>
            <div className="min-w-[160px]">
              <label htmlFor="direction" className="block text-sm font-medium text-text-muted mb-1">
                Direction
              </label>
              <Select
                id="direction"
                options={[{ value: '', label: 'All' }, ...DIRECTION_OPTIONS]}
                value={Array.isArray(filters.direction) ? filters.direction[0] : filters.direction ?? ''}
                onChange={v => handleFilterChange('direction', v ? [v] : undefined)}
                multiple
              />
            </div>
            <div className="min-w-[160px]">
              <label htmlFor="session" className="block text-sm font-medium text-text-muted mb-1">
                Session
              </label>
              <Select
                id="session"
                options={[{ value: '', label: 'All' }, ...SESSION_OPTIONS]}
                value={Array.isArray(filters.session) ? filters.session[0] : filters.session ?? ''}
                onChange={v => handleFilterChange('session', v ? [v] : undefined)}
                multiple
              />
            </div>
            <div className="min-w-[160px]">
              <label htmlFor="status" className="block text-sm font-medium text-text-muted mb-1">
                Status
              </label>
              <Select
                id="status"
                options={[{ value: '', label: 'All' }, ...STATUS_OPTIONS]}
                value={Array.isArray(filters.status) ? filters.status[0] : filters.status ?? ''}
                onChange={v => handleFilterChange('status', v ? [v] : undefined)}
                multiple
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary">Apply</Button>
              <Button type="button" variant="secondary" onClick={handleClearFilters}>
                Clear
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <Tabs
        tabs={REPORT_TYPES.map(rt => ({ id: rt.id, label: rt.label }))}
        activeId={reportType}
        onChange={handleReportTypeChange}
        label="Report type"
      >
        {metrics && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="text-text-muted text-sm">Net P&L</div>
              <div className="text-2xl font-mono font-semibold mt-1">
                <span className={parseFloat(metrics.netPnl) >= 0 ? 'text-positive' : 'text-negative'}>
                  {formatMoney(metrics.netPnl, currency)}
                </span>
              </div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Win Rate</div>
              <div className="text-2xl font-mono font-semibold mt-1">{formatPercent(metrics.winRate)}</div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Profit Factor</div>
              <div className="text-2xl font-mono font-semibold mt-1">
                {metrics.profitFactor ? parseFloat(metrics.profitFactor).toFixed(2) : '—'}
              </div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Avg R</div>
              <div className="text-2xl font-mono font-semibold mt-1">
                <span className={parseFloat(metrics.averageR) >= 0 ? 'text-positive' : 'text-negative'}>
                  {parseFloat(metrics.averageR).toFixed(2)}
                </span>
              </div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Total Trades</div>
              <div className="text-2xl font-mono font-semibold mt-1">{metrics.totalTrades}</div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Closed Trades</div>
              <div className="text-2xl font-mono font-semibold mt-1">{metrics.closedTrades}</div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Max Drawdown</div>
              <div className="text-2xl font-mono font-semibold mt-1 text-negative">
                {metrics.maxDrawdownPercent.toFixed(2)}%
              </div>
            </Card>
            <Card>
              <div className="text-text-muted text-sm">Total R</div>
              <div className="text-2xl font-mono font-semibold mt-1">
                <span className={parseFloat(metrics.totalR) >= 0 ? 'text-positive' : 'text-negative'}>
                  {parseFloat(metrics.totalR).toFixed(2)}
                </span>
              </div>
            </Card>
          </div>
        )}

        <Card>
          <div className="flex flex-wrap gap-2 mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-text-muted">
              Columns:
              <Select
                options={EXPORT_COLUMNS.map(c => ({ value: c.id, label: c.label }))}
                value={selectedColumns.join(',')}
                onChange={v => {
                  const cols = v.split(',').filter(Boolean) as ExportColumn[];
                  setSelectedColumns(cols);
                }}
                multiple
              />
            </label>
          </div>

          {breakdown.length === 0 ? (
            <EmptyState
              title="No data"
              description="No trades match the current filters. Adjust your filters or add trades to see data."
              action={{ label: 'Clear filters', onClick: handleClearFilters }}
            />
          ) : (
            <Table
              headers={['Key', 'Trades', 'Closed', 'Net P&L', 'Win Rate', 'Profit Factor', 'Avg R', 'Avg Win', 'Avg Loss']}
              align={['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}
              empty="No data for this report"
            >
              {breakdown.map((item, index) => (
                <tr key={`${item.key}-${index}`}>
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
                    <span className="text-text-muted text-xs">
                      {' '}({item.closedTrades > 0 ? Math.round((item.winRate / 100) * item.closedTrades) : 0}/{item.closedTrades})
                    </span>
                  </td>
                  <td className="text-right font-mono text-sm">
                    {item.profitFactor ? parseFloat(item.profitFactor).toFixed(2) : '—'}
                  </td>
                  <td className="text-right font-mono text-sm">
                    <span className={parseFloat(item.averageR) >= 0 ? 'text-positive' : 'text-negative'}>
                      {parseFloat(item.averageR).toFixed(2)}
                    </span>
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
          )}
        </Card>
      </Tabs>

      <div className="text-center text-text-muted text-sm" role="contentinfo">
        <p>Filters in URL are shareable. Bookmark or copy the URL to save this report view.</p>
        <p className="mt-1">
          Current filters:{' '}
          {Object.entries(filters).map(([k, v]) => (
            <Badge key={k} variant="soft">{k}: {Array.isArray(v) ? v.join(', ') : String(v)}</Badge>
          ))}
        </p>
      </div>
    </div>
  );
}