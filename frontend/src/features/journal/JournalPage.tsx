import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../components/ui/Toast.js';
import { journalApi, type JournalEntryInput } from './journal.api.js';
import type { JournalEntryResource } from '@tradeozeyid/contracts';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Input } from '../../components/ui/Input.js';
import { DatePicker } from '../../components/ui/DatePicker.js';
import { Select } from '../../components/ui/Select.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import { Badge } from '../../components/ui/Badge.js';

interface JournalEntryFormProps {
  entry: JournalEntryResource | null;
  accounts: Array<{ id: string; name: string; currency: string }>;
  onClose: () => void;
  onSubmit: (data: JournalEntryInput) => Promise<void>;
}

function JournalEntryForm({ entry, accounts, onClose, onSubmit }: JournalEntryFormProps) {
  const isEdit = !!entry;
  interface JournalEntryFormState {
    entryDate: string;
    title: string;
    body: string;
    moodScore: number | null;
    accountId: string;
  }
  const [formData, setFormData] = useState<JournalEntryFormState>({
    entryDate: entry?.entryDate ?? new Date().toISOString().split('T')[0],
    title: entry?.title ?? '',
    body: entry?.body ?? '',
    moodScore: entry?.moodScore ?? null,
    accountId: entry?.accountId ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof JournalEntryInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Partial<Record<keyof JournalEntryInput, string>> = {};
    if (!formData.entryDate) newErrors.entryDate = 'Entry date is required';
    if (!formData.body.trim()) newErrors.body = 'Body is required';
    const moodScore = formData.moodScore ?? undefined;
    if (moodScore !== undefined && (moodScore < 1 || moodScore > 5)) {
      newErrors.moodScore = 'Mood score must be between 1 and 5';
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
    <Dialog open onClose={onClose} title={isEdit ? 'Edit Journal Entry' : 'New Journal Entry'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <DatePicker
          label="Entry Date"
          value={formData.entryDate}
          onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
          error={errors.entryDate}
          required
        />

        <Input
          label="Title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Optional title"
          error={errors.title}
        />

        <Select
          label="Account (optional)"
          value={formData.accountId}
          onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
          options={[{ value: '', label: '— No account —' }, ...accounts.map(a => ({ value: a.id, label: `${a.name} (${a.currency})` }))]}
          placeholder="Select account"
          error={errors.accountId}
        />

        <Select
          label="Mood Score (1-5)"
          value={formData.moodScore !== null ? String(formData.moodScore) : ''}
          onChange={(e) => setFormData({ ...formData, moodScore: e.target.value ? parseInt(e.target.value, 10) : null })}
          options={['', '1', '2', '3', '4', '5'].map(v => ({ value: v, label: v || '—' }))}
          placeholder="Select mood"
          error={errors.moodScore}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="journal-body" className="text-sm font-medium text-text">
            Body
            <span aria-hidden="true" className="text-xs text-negative"> *</span>
          </label>
          <textarea
            id="journal-body"
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            className="w-full min-h-[120px] px-3 py-2 border border-border-strong rounded-lg bg-card text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
            placeholder="Write your journal entry..."
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

interface JournalEntryCardProps {
  entry: JournalEntryResource;
  accounts: Array<{ id: string; name: string; currency: string }>;
  onEdit: (entry: JournalEntryResource) => void;
  onDelete: (id: string) => void;
}

function JournalEntryCard({ entry, accounts, onEdit, onDelete }: JournalEntryCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text">{entry.entryDate}</span>
            {entry.moodScore !== null && (
              <Badge variant="accent" className="text-xs">
                Mood: {entry.moodScore}/5
              </Badge>
            )}
            {entry.accountId && (
              <Badge variant="neutral" className="text-xs">
                {accounts.find(a => a.id === entry.accountId)?.name ?? 'Unknown'}
              </Badge>
            )}
          </div>
          {entry.title && <h4 className="mt-1 font-medium text-text">{entry.title}</h4>}
          <p className="mt-2 text-text-muted line-clamp-3">{entry.body}</p>
          <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
            <span>{entry.wordCount} words</span>
            <span>{entry.emotions.length} emotions</span>
            <span>{entry.tradeSummary.tradeCount} trades ({entry.tradeSummary.closedTrades} closed)</span>
            <span className={parseFloat(entry.tradeSummary.netPnl) >= 0 ? 'text-positive' : 'text-negative'}>
              P&L: {entry.tradeSummary.netPnl}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={() => onEdit(entry)}>
            Edit
          </Button>
          <Button variant="ghost" onClick={() => onDelete(entry.id)}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function JournalPage() {
  const [entries, setEntries] = useState<JournalEntryResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<JournalEntryResource | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    accountId: '',
    hasEmotions: false,
  });
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, totalCount: 0 });
  const { show: toast } = useToast();

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await journalApi.listEntries({
        from: filters.from || undefined,
        to: filters.to || undefined,
        accountId: filters.accountId || undefined,
        hasEmotions: filters.hasEmotions || undefined,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      setEntries(response.data);
      setPagination(p => ({ ...p, totalCount: response.meta.pagination.totalCount }));
    } catch (error) {
      toast({ variant: 'error', title: 'Failed to load journal entries' });
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit, pagination.offset, toast]);

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/trading-accounts');
      const data = await response.json();
      setAccounts(data.data || []);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleCreate = async (data: JournalEntryInput) => {
    await journalApi.createEntry(data);
    toast({ variant: 'success', title: 'Journal entry created' });
    fetchEntries();
  };

  const handleUpdate = async (data: JournalEntryInput) => {
    if (!editingEntry) return;
    await journalApi.updateEntry(editingEntry.id, data);
    toast({ variant: 'success', title: 'Journal entry updated' });
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this journal entry?')) return;
    await journalApi.deleteEntry(id);
    toast({ variant: 'success', title: 'Journal entry deleted' });
    fetchEntries();
  };

  const openCreate = () => {
    setEditingEntry(null);
    setEditingEntry(null);
  };

  const openEdit = (entry: JournalEntryResource) => {
    setEditingEntry(entry);
  };

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading journal entries">
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
          <h1 className="text-2xl font-semibold text-text">Journal</h1>
          <p className="text-text-muted">Daily journal entries with emotions and trade summary</p>
        </div>
        <Button onClick={openCreate}>New Entry</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <DatePicker
            label="From"
            value={filters.from}
            onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))}
          />
          <DatePicker
            label="To"
            value={filters.to}
            onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))}
          />
          <Select
            label="Account"
            value={filters.accountId}
            onChange={(e) => setFilters(f => ({ ...f, accountId: e.target.value }))}
            options={[{ value: '', label: 'All accounts' }, ...accounts.map(a => ({ value: a.id, label: a.name }))]}
            placeholder="All accounts"
          />
          <Select
            label="Has Emotions"
            value={filters.hasEmotions ? 'true' : 'false'}
            onChange={(e) => setFilters(f => ({ ...f, hasEmotions: e.target.value === 'true' }))}
            options={[
              { value: 'false', label: 'All' },
              { value: 'true', label: 'With emotions' },
            ]}
          />
        </div>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          title="No journal entries"
          description="Create your first journal entry to start tracking your trading psychology."
          action={<Button onClick={openCreate}>New Entry</Button>}
        />
      ) : (
        <>
          <div className="space-y-4" role="list" aria-label="Journal entries">
            {entries.map(entry => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                accounts={accounts}
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

      <JournalEntryForm
        entry={editingEntry}
        accounts={accounts}
        onClose={() => { setEditingEntry(null); }}
        onSubmit={editingEntry ? handleUpdate : handleCreate}
      />
    </div>
  );
}