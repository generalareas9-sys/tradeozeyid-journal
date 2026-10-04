import { useEffect, useState } from 'react';
import { usePathname } from '../../app/router';
import { apiRequest } from '../../lib/api';
import { formatMoney, NULL_PLACEHOLDER } from '../../lib/format';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { TradeResource } from '@tradeozeyid/contracts';

/**
 * Trade detail page (Phase 6).
 *
 * Fetches and displays the full trade detail including:
 *  - Information (symbol, direction, status, session, dates, prices, sizes)
 *  - Executions (individual fills)
 *  - Risk (planned risk, R-multiple, RR ratio, fees, swap)
 *  - Strategy (if linked)
 *  - Tags
 *  - Screenshots (attachments)
 *  - Notes
 *  - Review
 */
export function TradeDetailPage() {
  const pathname = usePathname();
  const [trade, setTrade] = useState<TradeResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTrade() {
      try {
        setLoading(true);
        setError(null);

        // Extract trade ID from pathname like /trades/uuid
        const parts = pathname.split('/').filter(Boolean);
        const id = parts[1];

        if (!id) {
          throw new Error('No trade ID in URL');
        }

        const data = await apiRequest<TradeResource>(`/trades/${id}`);
        if (!cancelled) setTrade(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load trade');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTrade();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">{error ?? 'Trade not found'}</p>
      </div>
    );
  }

  const t = trade;

  // --- Helper formatters ---
  const fmtPrice = (v: string | null) => v ? formatMoney(v, t.account.currency) : NULL_PLACEHOLDER;
  const directionVariant = t.direction === 'long' ? 'positive' : 'negative';
  const statusVariant = t.status === 'closed' ? 'positive' :
    t.status === 'open' ? 'accent' :
    t.status === 'cancelled' ? 'accent' : 'neutral';

  return (
    <div className="space-y-5">
      {/* === Header === */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">
            {t.symbol} &nbsp;
            <Badge variant={directionVariant}>
              {t.direction === 'long' ? 'Long' : 'Short'}
            </Badge>
            &nbsp;
            <Badge variant={statusVariant}>
              {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
            </Badge>
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Session: <strong>{t.session.charAt(0).toUpperCase() + t.session.slice(1)}</strong> &nbsp;|&nbsp;
            Account: {t.account.name} ({t.account.currency}) &nbsp;|&nbsp;
            Type: {t.account.type}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {t.strategy && (
            <Badge variant="accent">Strategy: {t.strategy.name}</Badge>
          )}
          {t.tags.length > 0 && (
            <Badge variant="accent">{t.tags.length} tag(s)</Badge>
          )}
          {t.executions.length > 0 && (
            <Badge variant="accent">{t.executions.length} execution(s)</Badge>
          )}
          {t.attachments.length > 0 && (
            <Badge variant="accent">{t.attachments.length} attachment(s)</Badge>
          )}
        </div>
      </div>

      {/* === Main Grid === */}
      <div className="grid gap-5 xl:grid-cols-3">
        {/* Left column: Information + Risk */}
        <div className="xl:col-span-2 space-y-5">
          {/* Information Card */}
          <Card title="Information">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-text-muted">Symbol</dt>
              <dd className="font-mono font-medium">{t.symbol}</dd>

              <dt className="text-text-muted">Direction</dt>
              <dd>
                <Badge variant={directionVariant}>
                  {t.direction === 'long' ? 'Long' : 'Short'}
                </Badge>
              </dd>

              <dt className="text-text-muted">Status</dt>
              <dd>
                <Badge variant={statusVariant}>
                  {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                </Badge>
              </dd>

              <dt className="text-text-muted">Session</dt>
              <dd>{t.session.charAt(0).toUpperCase() + t.session.slice(1)}</dd>

              <dt className="text-text-muted">Entry time</dt>
              <dd className="font-mono">{t.entryTime ? new Date(t.entryTime).toLocaleString() : '—'}</dd>

              <dt className="text-text-muted">Exit time</dt>
              <dd className="font-mono">{t.exitTime ? new Date(t.exitTime).toLocaleString() : '—'}</dd>

              <dt className="text-text-muted">Entry price</dt>
              <dd className="font-mono">{fmtPrice(t.entryPrice)}</dd>

              <dt className="text-text-muted">Exit price</dt>
              <dd className="font-mono">{fmtPrice(t.exitPrice)}</dd>

              <dt className="text-text-muted">Stop loss</dt>
              <dd className="font-mono">{fmtPrice(t.stopLoss)}</dd>

              <dt className="text-text-muted">Take profit</dt>
              <dd className="font-mono">{fmtPrice(t.takeProfit)}</dd>

              <dt className="text-text-muted">Quantity</dt>
              <dd className="font-mono">{t.quantity ? Number(t.quantity).toLocaleString() : '—'} lots</dd>

              <dt className="text-text-muted">Contract size</dt>
              <dd className="font-mono">{t.contractSize}</dd>

              <dt className="text-text-muted">Contract currency</dt>
              <dd>{t.account.currency}</dd>

              <dt className="text-text-muted">Fees</dt>
              <dd className="font-mono">{formatMoney(t.fees, t.account.currency)}</dd>

              <dt className="text-text-muted">Swap</dt>
              <dd className="font-mono">{formatMoney(t.swap, t.account.currency)}</dd>

              {t.durationMinutes !== null && (
                <>
                  <dt className="text-text-muted">Duration</dt>
                  <dd>{Math.floor(t.durationMinutes / 60)}h {t.durationMinutes % 60}m</dd>
                </>
              )}
            </dl>
          </Card>

          {/* Risk Card */}
          <Card title="Risk">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-text-muted">Planned risk</dt>
              <dd className="font-mono font-medium">{formatMoney(t.plannedRisk, t.account.currency)}</dd>

              <dt className="text-text-muted">Risk % of balance</dt>
              <dd>{t.riskPercent !== null ? `${t.riskPercent.toFixed(3)}%` : '—'}</dd>

              <dt className="text-text-muted">R-multiple</dt>
              <dd className="font-mono font-medium">{t.rMultiple ?? '—'}</dd>

              <dt className="text-text-muted">RR ratio</dt>
              <dd>{t.takeProfit && t.stopLoss ? (Math.abs(parseFloat(t.takeProfit) - parseFloat(t.entryPrice)) / Math.abs(parseFloat(t.entryPrice) - parseFloat(t.stopLoss))).toFixed(2) : '—'}</dd>

              <dt className="text-text-muted">P&L</dt>
              <dd className={`font-mono font-medium ${t.pnl && parseFloat(t.pnl) < 0 ? 'text-negative' : 'text-positive'}`}>
                {t.pnl ? formatMoney(t.pnl, t.account.currency) : '—'}
              </dd>

              <dt className="text-text-muted">MAE</dt>
              <dd>{t.mae ? formatMoney(t.mae, t.account.currency) : '—'}</dd>

              <dt className="text-text-muted">MFE</dt>
              <dd>{t.mfe ? formatMoney(t.mfe, t.account.currency) : '—'}</dd>
            </dl>
          </Card>

          {/* Prices & Targets Card */}
          <Card title="Prices & Targets">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-text-muted">Entry</dt>
              <dd className="font-mono font-medium">{formatMoney(t.entryPrice, t.account.currency)}</dd>

              <dt className="text-text-muted">Stop loss</dt>
              <dd className="font-mono">{formatMoney(t.stopLoss, t.account.currency)}</dd>

              <dt className="text-text-muted">Take profit</dt>
              <dd>{formatMoney(t.takeProfit, t.account.currency)}</dd>

              <dt className="text-text-muted">R:R</dt>
              <dd>{t.takeProfit && t.stopLoss ? (Math.abs(parseFloat(t.takeProfit) - parseFloat(t.entryPrice)) / Math.abs(parseFloat(t.entryPrice) - parseFloat(t.stopLoss))).toFixed(2) : '—'}</dd>

              <dt className="text-text-muted">SL distance</dt>
              <dd className="font-mono">{formatMoney(Math.abs(parseFloat(t.entryPrice) - parseFloat(t.stopLoss)).toFixed(10), t.account.currency)}</dd>

              <dt className="text-text-muted">TP distance</dt>
              <dd>{t.takeProfit ? <span className="font-mono">{formatMoney(Math.abs(parseFloat(t.takeProfit) - parseFloat(t.entryPrice)).toFixed(10), t.account.currency)}</span> : '—'}</dd>
            </dl>
          </Card>
        </div>

        {/* Right column: Executions + Tags + Notes + Review + Attachments */}
        <div className="space-y-5">
          {/* Executions */}
          <Card title={`Executions (${t.executions.length})`}>
            {t.executions.length === 0 ? (
              <p className="text-sm text-text-muted">No executions recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left pb-2 text-text-muted">#</th>
                      <th className="text-left pb-2 text-text-muted">Side</th>
                      <th className="text-left pb-2 text-text-muted">Price</th>
                      <th className="text-left pb-2 text-text-muted">Qty</th>
                      <th className="text-left pb-2 text-text-muted">Fee</th>
                      <th className="text-left pb-2 text-text-muted">Time</th>
                      <th className="text-left pb-2 text-text-muted">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.executions.map((e) => (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="py-2 font-mono">{e.sequence}</td>
                        <td>
                          <Badge variant={e.side.startsWith('entry') ? 'positive' : e.side.startsWith('exit') ? 'negative' : 'accent'}>
                            {e.side.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="font-mono">{formatMoney(e.price, t.account.currency)}</td>
                        <td className="font-mono">{Number(e.quantity).toLocaleString()}</td>
                        <td className="font-mono">{formatMoney(e.fee, t.account.currency)}</td>
                        <td className="text-text-muted">{e.executedAt ? new Date(e.executedAt).toLocaleString() : '—'}</td>
                        <td className="text-text-muted">{e.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Tags */}
          <Card title={`Tags (${t.tags.length})`}>
            {t.tags.length === 0 ? (
              <p className="text-sm text-text-muted">No tags attached.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {t.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: tag.color ? `${tag.color}20` : undefined,
                      borderColor: tag.color ?? undefined,
                      color: tag.color ?? undefined,
                    }}
                  >
                    {tag.name} ({tag.category})
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Notes */}
          <Card title={`Notes (${t.notes.length})`}>
            {t.notes.length === 0 ? (
              <p className="text-sm text-text-muted">No notes.</p>
            ) : (
              <ul className="space-y-3">
                {t.notes.map((note) => (
                  <li key={note.id} className="text-sm">
                    <p className="whitespace-pre-wrap">{note.body}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {new Date(note.createdAt).toLocaleString()} {note.updatedAt !== note.createdAt ? `· updated ${new Date(note.updatedAt).toLocaleString()}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Review */}
          <Card title="Review">
            {t.review ? (
              <dl className="space-y-3 text-sm">
                {t.review.confidenceBefore !== null && (
                  <div><dt className="text-text-muted">Confidence</dt><dd>{t.review.confidenceBefore}/5</dd></div>
                )}
                {t.review.fearBefore !== null && (
                  <div><dt className="text-text-muted">Fear</dt><dd>{t.review.fearBefore}/5</dd></div>
                )}
                {t.review.fomoBefore !== null && (
                  <div><dt className="text-text-muted">FOMO</dt><dd>{t.review.fomoBefore}/5</dd></div>
                )}
                {t.review.patienceBefore !== null && (
                  <div><dt className="text-text-muted">Patience</dt><dd>{t.review.patienceBefore}/5</dd></div>
                )}
                {t.review.followedPlan !== null && (
                  <div><dt className="text-text-muted">Followed plan</dt><dd><Badge variant={t.review.followedPlan ? 'positive' : 'negative'}>{t.review.followedPlan ? 'Yes' : 'No'}</Badge></dd></div>
                )}
                {t.review.brokeRules !== null && (
                  <div><dt className="text-text-muted">Broke rules</dt><dd><Badge variant={t.review.brokeRules ? 'negative' : 'positive'}>{t.review.brokeRules ? 'Yes' : 'No'}</Badge></dd></div>
                )}
                {t.review.revengeTrade !== null && (
                  <div><dt className="text-text-muted">Revenge trade</dt><dd><Badge variant={t.review.revengeTrade ? 'negative' : 'positive'}>{t.review.revengeTrade ? 'Yes' : 'No'}</Badge></dd></div>
                )}
                {t.review.overtraded !== null && (
                  <div><dt className="text-text-muted">Overtraded</dt><dd><Badge variant={t.review.overtraded ? 'negative' : 'positive'}>{t.review.overtraded ? 'Yes' : 'No'}</Badge></dd></div>
                )}
                {t.review.enteredEarly !== null && (
                  <div><dt className="text-text-muted">Entered early</dt><dd><Badge variant={t.review.enteredEarly ? 'negative' : 'positive'}>{t.review.enteredEarly ? 'Yes' : 'No'}</Badge></dd></div>
                )}
                {t.review.movedStop !== null && (
                  <div><dt className="text-text-muted">Moved stop</dt><dd><Badge variant={t.review.movedStop ? 'negative' : 'positive'}>{t.review.movedStop ? 'Yes' : 'No'}</Badge></dd></div>
                )}
                {t.review.rulesFollowed !== null && (
                  <div><dt className="text-text-muted">Rules followed</dt><dd>{t.review.rulesFollowed}%</dd></div>
                )}
                {t.review.rating !== null && (
                  <div><dt className="text-text-muted">Rating</dt><dd>{t.review.rating}/5</dd></div>
                )}
                {t.review.body && (
                  <div className="mt-3"><dt className="text-text-muted">Notes</dt><dd className="whitespace-pre-wrap mt-1">{t.review.body}</dd></div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-text-muted">No review written yet.</p>
            )}
          </Card>

          {/* Attachments */}
          <Card title={`Attachments (${t.attachments.length})`}>
            {t.attachments.length === 0 ? (
              <p className="text-sm text-text-muted">No attachments.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {t.attachments.map((att) => (
                  <div key={att.id} className="border border-border rounded-lg p-3">
                    <p className="font-medium text-sm">{att.originalName}</p>
                    <p className="text-xs text-text-muted mt-1">
                      {att.kind} · {att.mimeType} · {(att.byteSize / 1024).toFixed(1)} KB
                      {att.width && att.height && ` · ${att.width}×${att.height}`}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      SHA-256: {att.checksumSha256.slice(0, 16)}…
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}