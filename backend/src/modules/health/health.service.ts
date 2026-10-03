import type { HealthResponse } from '@tradeozeyid/contracts';
import { getLogger } from '../../lib/logger.js';
import { pingDatabase } from './health.repository.js';

export const API_VERSION = '0.1.0';

export interface HealthStatus {
  httpStatus: 200 | 503;
  body: HealthResponse;
}

/**
 * Builds the health payload defined in api-spec.md §9.1. The database check is a
 * genuine round trip; a failure produces `503` with `database: "error"` and no
 * connection string, host, or stack trace is ever exposed.
 */
export async function checkHealth(requestId: string): Promise<HealthStatus> {
  const base = {
    version: API_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
  };

  try {
    await pingDatabase();

    return {
      httpStatus: 200,
      body: {
        data: { status: 'ok', database: 'ok', ...base },
        meta: { requestId },
      },
    };
  } catch (error) {
    getLogger().error({ requestId, error }, 'Health check: database unreachable');

    return {
      httpStatus: 503,
      body: {
        data: { status: 'error', database: 'error', ...base },
        meta: { requestId },
      },
    };
  }
}