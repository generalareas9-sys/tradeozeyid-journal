import { apiRequest } from '../../lib/api';
import type { TagResource } from '@tradeozeyid/contracts';

/**
 * Tags API client (api-spec.md §9.6).
 */
export async function listTags(params?: {
  category?: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom';
  q?: string;
  withCounts?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'createdAt' | 'updatedAt' | 'name';
  order?: 'asc' | 'desc';
}): Promise<{ data: TagResource[]; meta: { limit: number; offset: number } }> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.q) searchParams.set('q', params.q);
  if (params?.withCounts) searchParams.set('withCounts', 'true');
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.order) searchParams.set('order', params.order);

  return apiRequest<{ data: TagResource[]; meta: { limit: number; offset: number } }>(
    `/tags?${searchParams.toString()}`,
  );
}

export async function getTag(id: string) {
  return apiRequest<any>(`/tags/${id}`);
}

export async function createTag(input: {
  name: string;
  color?: string | null;
  category?: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom';
}) {
  return apiRequest<any>('/tags', {
    method: 'POST',
    body: input,
  });
}

export async function updateTag(
  id: string,
  patch: {
    name?: string;
    color?: string | null;
    category?: 'setup' | 'mistake' | 'emotion' | 'market' | 'custom';
  },
) {
  return apiRequest<any>(`/tags/${id}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function archiveTag(id: string) {
  return apiRequest<void>(`/tags/${id}`, {
    method: 'DELETE',
  });
}