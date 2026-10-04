import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPanel } from './HealthPanel';

/**
 * The Phase 1 health behaviour, preserved as it moves behind the shell.
 * These are the assertions that lived in the original `App.test.tsx`.
 */

const HEALTH_OK = {
  data: {
    status: 'ok',
    version: '0.1.0',
    database: 'ok',
    uptimeSeconds: 4211,
  },
  meta: { requestId: '0f9c1f2e-7d0b-4a52-9c9f-1c2e3f4a5b6c' },
};

function mockHealthOnce(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthPanel', () => {
  it('calls GET /api/v1/health on mount', async () => {
    const fetchMock = mockHealthOnce(HEALTH_OK);
    vi.stubGlobal('fetch', fetchMock);

    render(<HealthPanel />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/health');
  });

  it('reports that the API is reachable and shows the health payload', async () => {
    vi.stubGlobal('fetch', mockHealthOnce(HEALTH_OK));

    render(<HealthPanel />);

    await screen.findByText('API reachable');
    expect(screen.getByText('Database').nextSibling?.textContent).toBe('ok');
    expect(screen.getByText('Version').nextSibling?.textContent).toBe('0.1.0');
    expect(screen.getByText('Uptime').nextSibling?.textContent).toBe('1h 10m 11s');
  });

  it('reports an unreachable API when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<HealthPanel />);

    await screen.findByText('API unreachable');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('surfaces the documented error code when the API answers with an error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
              meta: { requestId: 'req-1' },
            }),
          ),
      }),
    );

    render(<HealthPanel />);

    await screen.findByText('API unreachable');
    expect(screen.getByText(/INTERNAL_ERROR/)).toBeTruthy();
  });
});