import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '../../lib/api';
import { fetchHealth, type HealthPayload } from './health.api';

export type HealthState =
  | { status: 'loading' }
  | { status: 'ready'; health: HealthPayload }
  | { status: 'unreachable'; message: string };

/**
 * The only place in the frontend that talks to the health endpoint. Components
 * read this state; they never fetch on their own (engineering-contract.md §8).
 */
export function useHealth(): { state: HealthState; refresh: () => void } {
  const [state, setState] = useState<HealthState>({ status: 'loading' });

  const load = useCallback(async (isCancelled: () => boolean) => {
    setState({ status: 'loading' });

    try {
      const health = await fetchHealth();
      if (!isCancelled()) setState({ status: 'ready', health });
    } catch (error) {
      if (isCancelled()) return;
      setState({
        status: 'unreachable',
        message:
          error instanceof ApiRequestError
            ? `${error.code}: ${error.message}`
            : 'The API could not be reached. Is the backend running on port 3000?',
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(() => {
    void load(() => false);
  }, [load]);

  return { state, refresh };
}