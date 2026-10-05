import { apiRequest } from '../../lib/api.js';
import type {
  JournalEntryResource,
  JournalEmotionResource,
  ReviewResource,
} from '@tradeozeyid/contracts';

export interface JournalEntryListResponse {
  data: JournalEntryResource[];
  meta: {
    requestId: string;
    pagination: {
      limit: number;
      offset: number;
      totalCount: number;
    };
  };
}

export interface ReviewListResponse {
  data: ReviewResource[];
  meta: {
    requestId: string;
    pagination: {
      limit: number;
      offset: number;
      totalCount: number;
    };
  };
}

export interface JournalEntryInput {
  entryDate: string;
  title?: string | null;
  body: string;
  moodScore?: number | null;
  accountId?: string | null;
}

export interface JournalEmotionInput {
  emotion: string;
  intensity: number;
  phase?: 'before' | 'during' | 'after';
  note?: string | null;
}

export interface ReviewInput {
  scope: 'daily' | 'weekly' | 'monthly' | 'custom';
  periodStart: string;
  periodEnd: string;
  title?: string | null;
  body: string;
  rating?: number | null;
}

export const journalApi = {
  async listEntries(params?: {
    from?: string;
    to?: string;
    accountId?: string;
    hasEmotions?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<JournalEntryListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.hasEmotions) searchParams.set('hasEmotions', 'true');
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    return apiRequest<JournalEntryListResponse>(`/journal/entries?${searchParams.toString()}`);
  },

  async getEntry(id: string): Promise<{ data: JournalEntryResource }> {
    return apiRequest<{ data: JournalEntryResource }>(`/journal/entries/${id}`);
  },

  async createEntry(input: JournalEntryInput): Promise<{ data: { id: string } }> {
    return apiRequest<{ data: { id: string } }>('/journal/entries', { method: 'POST', body: input });
  },

  async updateEntry(id: string, input: Partial<JournalEntryInput>): Promise<void> {
    await apiRequest<void>(`/journal/entries/${id}`, { method: 'PATCH', body: input });
  },

  async deleteEntry(id: string): Promise<void> {
    await apiRequest<void>(`/journal/entries/${id}`, { method: 'DELETE' });
  },

  async listEmotions(journalEntryId: string): Promise<{ data: JournalEmotionResource[] }> {
    return apiRequest<{ data: JournalEmotionResource[] }>(`/journal/entries/${journalEntryId}/emotions`);
  },

  async createEmotion(journalEntryId: string, input: JournalEmotionInput): Promise<{ data: { id: string } }> {
    return apiRequest<{ data: { id: string } }>(`/journal/entries/${journalEntryId}/emotions`, { method: 'POST', body: input });
  },

  async deleteEmotion(journalEntryId: string, emotionId: string): Promise<void> {
    await apiRequest<void>(`/journal/entries/${journalEntryId}/emotions/${emotionId}`, { method: 'DELETE' });
  },

  async listReviews(params?: {
    scope?: 'daily' | 'weekly' | 'monthly' | 'custom';
    periodStart?: string;
    periodEnd?: string;
    limit?: number;
    offset?: number;
  }): Promise<ReviewListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.scope) searchParams.set('scope', params.scope);
    if (params?.periodStart) searchParams.set('periodStart', params.periodStart);
    if (params?.periodEnd) searchParams.set('periodEnd', params.periodEnd);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));

    return apiRequest<ReviewListResponse>(`/reviews?${searchParams.toString()}`);
  },

  async createReview(input: ReviewInput): Promise<{ data: { id: string } }> {
    return apiRequest<{ data: { id: string } }>('/reviews', { method: 'POST', body: input });
  },

  async updateReview(id: string, input: Partial<ReviewInput>): Promise<void> {
    await apiRequest<void>(`/reviews/${id}`, { method: 'PATCH', body: input });
  },

  async deleteReview(id: string): Promise<void> {
    await apiRequest<void>(`/reviews/${id}`, { method: 'DELETE' });
  },
};