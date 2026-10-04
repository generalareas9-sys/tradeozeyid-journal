import React from "react";
import { useEffect, useState } from "react";
import { usePathname } from "../../app/router";
import { apiRequest } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { listRules, createRule, updateRule, deleteRule, reorderRules } from "./strategies.api";

export function StrategyDetailPage() {
  const pathname = usePathname();
  const [strategy, setStrategy] = useState<any | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStrategy() {
      try {
        setLoading(true);
        setError(null);

        const parts = pathname.split("/").filter(Boolean);
        const id = parts[1];

        if (!id) throw new Error("No strategy ID in URL");

        const [strategy, rules] = await Promise.all([
          apiRequest<any>(`/strategies/${id}`),
          listRules(id),
        ]);

        if (!cancelled) {
          setStrategy({
            id: strategy.id,
            name: strategy.name,
            description: strategy.description,
            category: strategy.category,
            status: strategy.status,
            color: strategy.color,
            rules: strategy.rules || [],
            tradeCount: strategy.tradeCount,
          });
          setRules(strategy.rules || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load strategy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStrategy();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">{error ?? "Strategy not found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-text">{strategy.name}</h1>
            {strategy.status === "archived" && <Badge variant="neutral">Archived</Badge>}
          </div>
          <p className="text-sm text-text-muted mt-1">
            {strategy.tradeCount} trade(s) \u2022 {strategy.rules.length} rule(s)
            {strategy.category && " \u2022 " + strategy.category}
          </p>
        </div>
      </div>

      <Card title="Test">
        <div>Test content</div>
      </Card>
    </div>
  );
}