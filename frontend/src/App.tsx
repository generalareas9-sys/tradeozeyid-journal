import { useHealth } from './features/health/useHealth';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-200 py-2 last:border-b-0">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

/**
 * Phase 1 foundation shell. It proves the frontend workspace can reach the
 * backend health endpoint through the Vite dev proxy. Design system work
 * (tokens, primitives, layout) is Phase 2.
 */
export default function App() {
  const { state, refresh } = useHealth();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">TradeOzeyid</h1>
      <p className="mt-1 text-gray-600">Phase 1 — project foundation</p>

      <section className="mt-8 rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-medium">API status</h2>

        {state.status === 'loading' && <p role="status">Checking /api/v1/health…</p>}

        {state.status === 'ready' && (
          <>
            <p role="status">API reachable</p>
            <dl className="mt-4">
              <Row label="Status" value={state.health.status} />
              <Row label="Database" value={state.health.database} />
              <Row label="Version" value={state.health.version} />
              <Row label="Uptime" value={`${state.health.uptimeSeconds}s`} />
            </dl>
          </>
        )}

        {state.status === 'unreachable' && (
          <>
            <p role="alert">API unreachable</p>
            <p className="mt-2 text-gray-600">{state.message}</p>
          </>
        )}

        <button type="button" className="mt-4 underline" onClick={refresh}>
          Re-check
        </button>
      </section>
    </main>
  );
}