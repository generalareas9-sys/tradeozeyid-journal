import { Card } from '../../components/ui/Card';
import { useHealth } from './useHealth';
import type { HealthPayload } from './health.api';

function Row({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={numeric ? 'font-numeric text-sm font-medium text-text' : 'text-sm font-medium text-text'}>
        {value}
      </dd>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${remaining}s`);

  return parts.join(' ');
}

/**
 * The Phase 1 foundation check, kept intact and now hosted on the
 * `/foundation` screen instead of owning the whole application.
 *
 * It performs the same `GET /api/v1/health` request, through the same Vite dev
 * proxy, as it did before the shell existed. The backend endpoint is untouched.
 */
export function HealthPanel() {
  const { state } = useHealth();

  if (state.status === 'loading') {
    return (
      <Card title="Foundation status" subtitle="Phase 1 check of the local API and database">
        <p role="status" className="text-sm text-text-muted">
          Checking /api/v1/health…
        </p>
      </Card>
    );
  }

  if (state.status === 'unreachable') {
    return (
      <Card title="Foundation status" subtitle="Phase 1 check of the local API and database">
        <p role="alert" className="text-sm font-semibold text-negative">
          API unreachable
        </p>
        <p className="mt-2 text-sm text-text-muted">{state.message}</p>
      </Card>
    );
  }

  const health: HealthPayload = state.health;

  return (
    <Card title="Foundation status" subtitle="Phase 1 check of the local API and database">
      <p role="status" className="text-sm font-semibold text-positive">
        API reachable
      </p>

      <dl className="mt-3">
        <Row label="Status" value={health.status} />
        <Row label="Database" value={health.database} />
        <Row label="Version" value={health.version} />
        <Row label="Uptime" value={formatUptime(health.uptimeSeconds)} numeric />
      </dl>
    </Card>
  );
}