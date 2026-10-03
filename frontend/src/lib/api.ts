import type { ApiErrorResponse } from '@tradeozeyid/contracts';

/** Every API call goes through here so the envelope handling lives in one place. */
export const API_BASE_URL = '/api/v1';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(status: number, body: ApiErrorResponse | null, fallbackMessage: string) {
    super(body?.error?.message ?? fallbackMessage);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.requestId = body?.meta?.requestId;
  }
}

/**
 * Issues a GET request and unwraps the success envelope defined in
 * api-spec.md §1. Non-2xx responses raise an `ApiRequestError` carrying the
 * documented error code, so callers never have to inspect a raw response.
 */
export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiRequestError(response.status, body as ApiErrorResponse | null, response.statusText);
  }

  return (body as { data: T }).data;
}