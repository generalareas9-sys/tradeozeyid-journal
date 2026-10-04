import { apiRequest } from '../../lib/api';
import type { StrategyResource, StrategyRuleResource } from '@tradeozeyid/contracts';

/**
 * Strategies API client (api-spec.md §9.5).
 */
export async function listStrategies(params?: {
  status?: 'active' | 'archived';
  q?: string;
  limit?: number;
  offset?: number;
  sort?: 'createdAt' | 'updatedAt' | 'name';
  order?: 'asc' | 'desc';
}): Promise<{ data: StrategyResource[]; meta: { limit: number; offset: number } }> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.q) searchParams.set('q', params.q);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);

  return apiRequest<{ data: StrategyResource[]; meta: { limit: number; offset: number } }>(
    `/strategies?${searchParams.toString()}`,
  );
}

export async function getStrategy(id: string): Promise<StrategyResource> {
  return apiRequest<StrategyResource>(`/strategies/${id}`);
}

export async function createStrategy(input: {
  name: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  status?: 'active' | 'archived';
}): Promise<{ id: string }> {
  return apiRequest<{ id: string }>('/strategies', {
    method: 'POST',
    body: input,
  });
}

export async function updateStrategy(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    category?: string | null;
    color?: string | null;
    status?: 'active' | 'archived';
  },
): Promise<StrategyResource> {
  return apiRequest<StrategyResource>(`/strategies/${id}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function archiveStrategy(id: string): Promise<void> {
  return apiRequest<void>(`/strategies/${id}`, {
    method: 'DELETE',
  });
}

// Rules
export async function listRules(
  strategyId: string,
  options?: { limit?: number; offset?: number },
): Promise<StrategyRuleResource[]> {
  const searchParams = new URLSearchParams();
  if (options?.limit) searchParams.set('limit', String(options.limit));
  if (options?.offset) searchParams.set('offset', String(options.offset));

  return apiRequest<StrategyRuleResource[]>(`/strategies/${strategyId}/rules?${searchParams.toString()}`);
}

export async function createRule(
  strategyId: string,
  input: { text: string; isRequired?: boolean },
): Promise<StrategyRuleResource> {
  return apiRequest<StrategyRuleResource>(`/strategies/${strategyId}/rules`, {
    method: 'POST',
    body: input,
  });
}

export async function updateRule(
  strategyId: string,
  ruleId: string,
  patch: { text?: string; isRequired?: boolean },
): Promise<StrategyRuleResource> {
  return apiRequest<StrategyRuleResource>(`/strategies/${strategyId}/rules/${ruleId}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function deleteRule(strategyId: string, ruleId: string): Promise<void> {
  return apiRequest<void>(`/strategies/${strategyId}/rules/${ruleId}`, {
    method: 'DELETE',
  });
}

export async function reorderRules(strategyId: string, ruleIds: string[]): Promise<void> {
  return apiRequest<void>(`/strategies/${strategyId}/rules/order`, {
    method: 'PUT',
    body: { ruleIds },
  });
}