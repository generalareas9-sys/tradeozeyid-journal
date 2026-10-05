import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../components/ui/Toast.js';
import { journalApi, type ReviewInput } from './journal.api.js';
import type { ReviewResource } from '@tradeozeyid/contracts';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Input } from '../../components/ui/Input.js';
import { DatePicker } from '../../components/ui/DatePicker.js';
import { Select } from '../../components/ui/Select.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Badge } from '../../components/ui/Badge.js';

interface ReviewFormProps {
  review: ReviewResource | null;
  onClose: () => void;
  onSubmit: (data: ReviewInput) => Promise<void>;
}

function ReviewForm({ review, onClose, onSubmit }: ReviewFormProps) {
  const isEdit = !!review;
  interface ReviewFormState {
    scope: 'daily' | 'weekly' | 'monthly' | 'custom';
    periodStart: string;
    periodEnd: string;
    title: string;
    body: string;
    rating: number | null;
  }
  const [formData, setFormData] = useState<ReviewFormState>({
    scope: review?.scope ?? 'daily',
    periodStart: review?.periodStart ?? new Date().toISOString().split('T')[0],
    periodEnd: review?.periodEnd ?? new Date().toISOString().split('T')[0],
    title: review?.title ?? '',
    body: review?.body ?? '',
    rating: review?.rating ?? null,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ReviewInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Partial<Record<keyof ReviewInput, string>> = {};
    if (!formData.periodStart) newErrors.periodStart = 'Period start is required';
    if (!formData.periodEnd) newErrors.periodEnd = 'Period end is required';
    if (formData.periodStart && formData.periodEnd && formData.periodEnd < formData.periodStart) {
      newErrors.periodEnd = 'Period end must be after period start';
    }
    if (!formData.body.trim()) newErrors.body = 'Body is required';
    const rating = formData.rating ?? undefined;
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      newErrors.rating = 'Rating must be between 1 and 5';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      // Error handled by API layer (toast)
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={isEdit ? 'Edit Review' : 'New Review'}>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <Select
          label="Scope"
          value={formData.scope}
          onChange={(e) => setFormData({ ...formData, scope: e.target.value as ReviewInput['scope'] })}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'custom', label: 'Custom' },
          ]}
          error={errors.scope}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <DatePicker
            label="Period Start"
            value={formData.periodStart}
            onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
            error={errors.periodStart}
            required
          />
          <DatePicker
            label="Period End"
            value={formData.periodEnd}
            onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
            error={errors.periodEnd}
            required
          />
        </div>

        <Input
          label="Title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Optional title"
          error={errors.title}
        />

        <Select
          label="Rating (1-5)"
          value={formData.rating !== null ? String(formData.rating) : ''}
          onChange={(e) => setFormData({ ...formData, rating: e.target.value ? parseInt(e.target.value, 10) : null })}
          options={['', '1', '2', '3', '4', '5'].map(v => ({ value: v, label: v || '—' }))}
          placeholder="Select rating"
          error={errors.rating}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="review-body" className="text-sm font-medium text-text">
            Body
            <span aria-hidden="true" className="text-xs text-negative"> *</span>
          </label>
          <textarea
            id="review-body"
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            className="w-full min-h-[160px] px-3 py-2 border border-border-strong rounded-lg bg-card text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
            placeholder="Write your review..."
            required
          />
          {errors.body && (
            <p className="text-xs font-medium text-negative">{errors.body}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} loading={submitting}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface ReviewCardProps {
  review: ReviewResource;
  onEdit: (review: ReviewResource) => void;
  onDelete: (id: string) => void;
}

function ReviewCard({ review, onEdit, onDelete }: ReviewCardProps) {
  const scopeLabels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom',
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="accent">{scopeLabels[review.scope] ?? review.scope}</Badge>
            <span className="text-sm text-text-muted">
              {review.periodStart} → {review.periodEnd}
            </span>
          </div>
          {review.title && <h4 className="mt-1 font-medium text-text">{review.title}</h4>}
          <p className="mt-2 text-text-muted line-clamp-3">{review.body}</p>
          {review.rating !== null && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-text-muted">Rating:</span>
              {[1, 2, 3, 4, 5].map(star => (
                <span
                  key={star}
                  className={`text-lg ${star <= review.rating! ? 'text-positive' : 'text-text-muted'}`}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={() => onEdit(review)}>
            Edit
          </Button>
          <Button variant="ghost" onClick={() => onDelete(review.id)}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReview, setEditingReview] = useState<ReviewResource | null>(null);
  const [filters, setFilters] = useState({
    scope: '',
    periodStart: '',
    periodEnd: '',
  });
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, totalCount: 0 });
  const { show: toast } = useToast();

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const scope = filters.scope || undefined;
      const response = await journalApi.listReviews({
        scope: scope as 'daily' | 'weekly' | 'monthly' | 'custom' | undefined,
        periodStart: filters.periodStart || undefined,
        periodEnd: filters.periodEnd || undefined,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      setReviews(response.data);
      setPagination(p => ({ ...p, totalCount: response.meta.pagination.totalCount }));
    } catch (error) {
      toast({ variant: 'error', title: 'Failed to load reviews' });
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit, pagination.offset, toast]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleCreate = async (data: ReviewInput) => {
    await journalApi.createReview(data);
    toast({ variant: 'success', title: 'Review created' });
    fetchReviews();
  };

  const handleUpdate = async (data: ReviewInput) => {
    if (!editingReview) return;
    await journalApi.updateReview(editingReview.id, data);
    toast({ variant: 'success', title: 'Review updated' });
    fetchReviews();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this review?')) return;
    await journalApi.deleteReview(id);
    toast({ variant: 'success', title: 'Review deleted' });
    fetchReviews();
  };

  const openCreate = () => {
    setEditingReview(null);
  };

  const openEdit = (review: ReviewResource) => {
    setEditingReview(review);
  };

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading reviews">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Reviews</h1>
          <p className="text-text-muted">Daily, weekly, monthly and custom written reviews</p>
        </div>
        <Button onClick={openCreate}>New Review</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <Select
            label="Scope"
            value={filters.scope}
            onChange={(e) => setFilters(f => ({ ...f, scope: e.target.value }))}
            options={[
              { value: '', label: 'All scopes' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'custom', label: 'Custom' },
            ]}
            placeholder="All scopes"
          />
          <DatePicker
            label="Period Start"
            value={filters.periodStart}
            onChange={(e) => setFilters(f => ({ ...f, periodStart: e.target.value }))}
          />
          <DatePicker
            label="Period End"
            value={filters.periodEnd}
            onChange={(e) => setFilters(f => ({ ...f, periodEnd: e.target.value }))}
          />
        </div>
      </Card>

      {reviews.length === 0 ? (
        <EmptyState
          title="No reviews"
          description="Create your first review to reflect on your trading performance."
          action={<Button onClick={openCreate}>New Review</Button>}
        />
      ) : (
        <>
          <div className="space-y-4" role="list" aria-label="Reviews">
            {reviews.map(review => (
              <ReviewCard
                key={review.id}
                review={review}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {pagination.totalCount > pagination.limit && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                disabled={pagination.offset === 0}
                onClick={() => setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
              >
                Previous
              </Button>
              <span className="text-text-muted">
                Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.totalCount / pagination.limit)}
              </span>
              <Button
                variant="secondary"
                disabled={pagination.offset + pagination.limit >= pagination.totalCount}
                onClick={() => setPagination(p => ({ ...p, offset: p.offset + p.limit }))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <ReviewForm
        review={editingReview}
        onClose={() => { setEditingReview(null); }}
        onSubmit={editingReview ? handleUpdate : handleCreate}
      />
    </div>
  );
}