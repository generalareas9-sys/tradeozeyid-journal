import { useEffect, useState } from 'react';
import { usePathname } from '../../app/router';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { formatMoney } from '../../lib/format';
import { listStrategies, createStrategy, archiveStrategy } from './strategies.api';
import type { StrategyResource } from '@tradeozeyid/contracts';

/**
 * Strategies list page (Phase 7).
 *
 * Displays a searchable, paginated list of strategies with their rule counts
 * and trade counts. Provides create and archive actions.
 */
export function StrategyListPage() {
  const pathname = usePathname();
  const [strategies, setStrategies] = useState<StrategyResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    category: '',
    color: '#800080',
    status: 'active' as 'active' | 'archived',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStrategies() {
      try {
        setLoading(true);
        setError(null);
        const response = await listStrategies({ q: searchQuery || undefined });
        if (!cancelled) setStrategies(response.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load strategies');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStrategies();

    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createStrategy(createForm);
      setShowCreateDialog(false);
      setCreateForm({ name: '', description: '', category: '', color: '#800080', status: 'active' });
      const response = await listStrategies({ q: searchQuery || undefined });
      setStrategies(response.data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create strategy');
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this strategy? Rules will be removed.')) return;
    try {
      await archiveStrategy(id);
      setStrategies(strategies.filter(s => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive strategy');
    }
  }

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
          <h1 className="text-2xl font-semibold text-text">Strategies</h1>
          <p className="text-sm text-text-muted mt-1">
            Reusable trade setups with ordered rule checklists.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} variant="primary">
          New Strategy
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <Input
          placeholder="Search strategies..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </Card>

      {/* Strategies List */}
      <Card>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No strategies found.</p>
            <Button onClick={() => setShowCreateDialog(true)} variant="primary" className="mt-4">
              Create your first strategy
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {strategies.map(strategy => (
              <div key={strategy.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-text truncate">{strategy.name}</h3>
                    {strategy.status === 'archived' && (
                      <Badge variant="neutral">Archived</Badge>
                    )}
                  </div>
                  {strategy.description && (
                    <p className="text-sm text-text-muted mt-1 truncate">{strategy.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2 text-sm">
                    <Badge variant="neutral">{strategy.tradeCount} trade(s)</Badge>
                    {strategy.rules.length > 0 && (
                      <Badge variant="accent">{strategy.rules.length} rule(s)</Badge>
                    )}
                    {strategy.category && (
                      <Badge variant="neutral">{strategy.category}</Badge>
                    )}
                    {strategy.color && (
                      <Badge variant="accent" style={{ backgroundColor: `${strategy.color}20`, borderColor: strategy.color, color: strategy.color }}>
                        {strategy.color}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = `/strategies/${strategy.id}`}
                    disabled={strategy.status === 'archived'}
                  >
                    Open
                  </Button>
                  {strategy.status === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      variant="danger"
                      onClick={() => handleArchive(strategy.id)}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">New Strategy</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Name *</label>
                <Input
                  value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  maxLength={60}
                  placeholder="e.g. Breakout Pullback"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Description</label>
                <Input
                  value={createForm.description}
                  onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                  maxLength={500}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Category</label>
                <Input
                  value={createForm.category}
                  onChange={e => setCreateForm({ ...createForm, category: e.target.value })}
                  maxLength={60}
                  placeholder="e.g. Breakout, Trend Following"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-text-muted mb-1">Status</label>
                  <select
                    value={createForm.status}
                    onChange={e => setCreateForm({ ...createForm, status: e.target.value as 'active' | 'archived' })}
                    className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  {creating ? 'Creating...' : 'Create Strategy'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}