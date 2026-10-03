import type { HealthResponse } from '@tradeozeyid/contracts';
import { getJson } from '../../lib/api';

export type HealthPayload = HealthResponse['data'];

/** Mirrors the backend `health` module: GET /api/v1/health (api-spec.md §9.1). */
export async function fetchHealth(): Promise<HealthPayload> {
  return getJson<HealthPayload>('/health');
}