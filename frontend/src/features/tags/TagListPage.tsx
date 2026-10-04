import { useEffect, useState } from 'react';
import { usePathname } from '../../app/router';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { listTags, createTag, archiveTag } from './tags.api';
import type { TagResource } from '@tradeozeyid/contracts';

/**
 * Tags list page (Phase 7).
 *
 * Displays a searchable, paginated list of tags with categories and optional trade counts.
 * Provides create and archive actions.
 */
export function TagListPage() {
  const pathname = usePathname();
  const [tags, setTags] = useState<TagResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'setup' | 'mistake' | 'emotion' | 'market' | 'custom' | ''>('');
  const [showCounts, setShowCounts] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    color: '#800080',
    category: 'custom' as 'setup' | 'mistake' | 'emotion' | 'market' | 'custom',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTags() {
      try {
        setLoading(true);
        setError(null);
        const response = await listTags({
          q: searchQuery || undefined,
          category: selectedCategory || undefined,
          withCounts: showCounts,
        });
        if (!cancelled) setTags(response.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tags');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTags();

    return () => {
      cancelled = true;
    };
  }, [searchQuery, selectedCategory, showCounts]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createTag(createForm);
      setShowCreateDialog(false);
      setCreateForm({ name: '', color: '#800080', category: 'custom' });
      const response = await listTags({
        q: searchQuery || undefined,
        category: selectedCategory || undefined,
        withCounts: showCounts,
      });
      setTags(response.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this tag? It will be removed from all trades.')) return;
    try {
      await archiveTag(id);
      setTags(tags.filter(t => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive tag');
    }
  }

  const categoryLabels: Record<string, string> = {
    setup: 'Setup',
    mistake: 'Mistake',
    emotion: 'Emotion',
    market: 'Market',
    custom: 'Custom',
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Tags</h1>
          <p className="text-sm text-text-muted mt-1">
            User-scoped labels with categories, used to slice the journal.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} variant="primary">
          New Tag
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 max-w-md"
          />
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value as any)}
            className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="">All Categories</option>
            <option value="setup">Setup</option>
            <option value="mistake">Mistake</option>
            <option value="emotion">Emotion</option>
            <option value="market">Market</option>
            <option value="custom">Custom</option>
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showCounts}
              onChange={e => setShowCounts(e.target.checked)}
              className="rounded border-border-strong"
            />
            <span className="text-sm text-text-muted">Show trade counts</span>
          </label>
        </div>
      </Card>

      {/* Tags List */}
      <Card>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : tags.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No tags found.</p>
            <Button onClick={() => setShowCreateDialog(true)} variant="primary" className="mt-4">
              Create your first tag
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tags.map(tag => (
              <div key={tag.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-text truncate">{tag.name}</h3>
                    <Badge variant="accent" style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color, color: tag.color }}>
                      {categoryLabels[tag.category] ?? tag.category}
                    </Badge>
                    {tag.tradeCount !== undefined && showCounts && (
                      <Badge variant="neutral">{tag.tradeCount} trade(s)</Badge>
                    )}
                    <Badge variant="neutral" style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color, color: tag.color }}>
                      {tag.color}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  variant="danger"
                  onClick={() => handleArchive(tag.id)}
                >
                  Archive
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">New Tag</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Name *</label>
                <Input
                  value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  maxLength={40}
                  placeholder="e.g. Breakout, Revenge Trade"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Color</label>
                <Input
                  type="color"
                  value={createForm.color}
                  onChange={e => setCreateForm({ ...createForm, color: e.target.value })}
                  className="h-10 w-full cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Category</label>
                <select
                  value={createForm.category}
                  onChange={e => setCreateForm({ ...createForm, category: e.target.value as any })}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="setup">Setup</option>
                  <option value="mistake">Mistake</option>
                  <option value="emotion">Emotion</option>
                  <option value="market">Market</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  {creating ? 'Creating...' : 'Create Tag'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

async function handleCreate(e: React.FormEvent) {
  e.preventDefault();
  setCreating(true);
  try {
    await createTag(createForm);
    setShowCreateDialog(false);
    setCreateForm({ name: '', color: '#800080', category: 'custom' });
    const response = await listTags({
      q: searchQuery || undefined,
      category: selectedCategory || undefined,
      withCounts: showCounts,
    });
    setTags(response.data);
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to create tag');
  } finally {
    setCreating(false);
  }
}

async function handleArchive(id: string) {
  if (!confirm('Archive this tag? It will be removed from all trades.')) return;
  try {
    await archiveTag(id);
    setTags(tags.filter(t => t.id !== id));
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to archive tag');
  }
}