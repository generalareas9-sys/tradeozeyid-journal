import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import type { RiskCalculateRequest, RiskCalculateResponse, TradingAccountResource } from '@tradeozeyid/contracts';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FieldShell } from '../../components/ui/FieldShell';
import { formatMoney, formatPercent } from '../../lib/format';

interface AccountOption {
  id: string;
  name: string;
  currency: string;
  currentBalance: string;
  defaultRiskPercent: number;
}

const DIRECTION_OPTIONS = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
] as const;

const BROKER_SYMBOL_PRESETS = [
  { broker: 'Exness', symbol: 'XAUUSDc', contractSize: '1', lotStep: '0.01', minLot: '0.01', maxLot: '100', label: 'Exness — XAUUSDc (Gold)' },
  { broker: 'Exness', symbol: 'EURUSD', contractSize: '100', lotStep: '0.01', minLot: '0.01', maxLot: '100', label: 'Exness — EURUSD' },
  { broker: 'Exness', symbol: 'GBPUSD', contractSize: '100', lotStep: '0.01', minLot: '0.01', maxLot: '100', label: 'Exness — GBPUSD' },
  { broker: 'Exness', symbol: 'USDJPY', contractSize: '100', lotStep: '0.01', minLot: '0.01', maxLot: '100', label: 'Exness — USDJPY' },
  { broker: 'Custom', symbol: '', contractSize: '', lotStep: '', minLot: '', maxLot: '', label: 'Custom…' },
] as const;

interface CalculatorState {
  accountId: string;
  balance: string;
  riskPercent: string;
  riskAmount: string;
  direction: 'long' | 'short';
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  broker: string;
  symbol: string;
  contractSize: string;
  lotStep: string;
  minLot: string;
  maxLot: string;
  pipValue: string;
}

interface ValidationErrors {
  [key: string]: string;
}

const INITIAL_STATE: CalculatorState = {
  accountId: '',
  balance: '',
  riskPercent: '1',
  riskAmount: '',
  direction: 'long',
  entryPrice: '',
  stopLoss: '',
  takeProfit: '',
  broker: 'Exness',
  symbol: 'XAUUSDc',
  contractSize: '1',
  lotStep: '0.01',
  minLot: '0.01',
  maxLot: '100',
  pipValue: '',
};

export function RiskCalculatorPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [state, setState] = useState<CalculatorState>(INITIAL_STATE);
  const [result, setResult] = useState<RiskCalculateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [presetName, setPresetName] = useState('');

  // Fetch accounts on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const data = await apiRequest<{ data: TradingAccountResource[] }>('/trading-accounts');
        const mapped = data.data.map((acc) => ({
          id: acc.id,
          name: acc.name,
          currency: acc.currency,
          currentBalance: acc.currentBalance,
          defaultRiskPercent: acc.defaultRiskPercent,
        }));
        setAccounts(mapped);
        if (mapped.length > 0 && !state.accountId) {
          const defaultAcc = mapped.find((a) => a.name === 'Exness XAUUSDc') || mapped[0];
          setState((s) => ({
            ...s,
            accountId: defaultAcc.id,
            balance: defaultAcc.currentBalance,
            riskPercent: defaultAcc.defaultRiskPercent.toFixed(3),
          }));
        }
      } catch (err) {
        console.error('Failed to load accounts:', err);
      } finally {
        setLoadingAccounts(false);
      }
    }
    loadAccounts();
  }, []);

  // Update instrument specs when broker/symbol changes
  useEffect(() => {
    const preset = BROKER_SYMBOL_PRESETS.find((p) => p.broker === state.broker && p.symbol === state.symbol);
    if (preset && preset !== BROKER_SYMBOL_PRESETS[BROKER_SYMBOL_PRESETS.length - 1]) {
      setState((s) => ({
        ...s,
        contractSize: preset.contractSize,
        lotStep: preset.lotStep,
        minLot: preset.minLot,
        maxLot: preset.maxLot,
      }));
    }
  }, [state.broker, state.symbol]);

  const handleChange = useCallback((field: keyof CalculatorState, value: string) => {
    setState((s) => ({ ...s, [field]: value }));
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors((e) => {
        const next = { ...e };
        delete next[field];
        return next;
      });
    }
    // Clear general error
    if (error) setError(null);
  }, [fieldErrors, error]);

  const handleAccountChange = useCallback((accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      setState((s) => ({
        ...s,
        accountId,
        balance: account.currentBalance,
        riskPercent: account.defaultRiskPercent.toFixed(3),
      }));
    }
  }, [accounts]);

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!state.accountId) errors.accountId = 'Select an account';
    if (!state.balance || parseFloat(state.balance) <= 0) errors.balance = 'Balance must be positive';
    if (!state.riskPercent && !state.riskAmount) {
      errors.riskPercent = 'Enter risk percent or risk amount';
    }
    if (state.riskPercent && (parseFloat(state.riskPercent) <= 0 || parseFloat(state.riskPercent) > 100)) {
      errors.riskPercent = 'Risk percent must be 0–100';
    }
    if (state.riskAmount && parseFloat(state.riskAmount) <= 0) {
      errors.riskAmount = 'Risk amount must be positive';
    }
    if (!state.entryPrice || parseFloat(state.entryPrice) <= 0) errors.entryPrice = 'Entry price must be positive';
    if (!state.stopLoss || parseFloat(state.stopLoss) <= 0) errors.stopLoss = 'Stop loss must be positive';

    // Validate SL/TP side
    const entry = parseFloat(state.entryPrice);
    const sl = parseFloat(state.stopLoss);
    if (entry > 0 && sl > 0) {
      if (state.direction === 'long' && sl >= entry) {
        errors.stopLoss = 'Stop loss must be below entry for long';
      }
      if (state.direction === 'short' && sl <= entry) {
        errors.stopLoss = 'Stop loss must be above entry for short';
      }
    }

    if (state.takeProfit) {
      const tp = parseFloat(state.takeProfit);
      if (tp <= 0) errors.takeProfit = 'Take profit must be positive';
      else if (state.direction === 'long' && tp <= entry) {
        errors.takeProfit = 'Take profit must be above entry for long';
      } else if (state.direction === 'short' && tp >= entry) {
        errors.takeProfit = 'Take profit must be below entry for short';
      }
    }

    if (parseFloat(state.contractSize) <= 0) errors.contractSize = 'Contract size must be positive';
    if (parseFloat(state.lotStep) <= 0) errors.lotStep = 'Lot step must be positive';
    if (parseFloat(state.minLot) < parseFloat(state.lotStep)) errors.minLot = 'Min lot must be ≥ lot step';
    if (parseFloat(state.maxLot) < parseFloat(state.minLot)) errors.maxLot = 'Max lot must be ≥ min lot';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCalculate = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const payload: RiskCalculateRequest = {
        accountId: state.accountId,
        balance: state.balance,
        riskPercent: state.riskPercent || undefined,
        riskAmount: state.riskAmount || null,
        direction: state.direction,
        entryPrice: state.entryPrice,
        stopLoss: state.stopLoss,
        takeProfit: state.takeProfit || undefined,
        broker: state.broker,
        symbol: state.symbol,
        contractSize: state.contractSize,
        lotStep: state.lotStep,
        minLot: state.minLot,
        maxLot: state.maxLot,
        pipValue: state.pipValue || null,
      };

      const data = await apiRequest<RiskCalculateResponse>('/risk/calculate', {
        method: 'POST',
        body: payload,
      });

      setResult(data);
      setWarnings(data.warnings || []);
    } catch (err) {
      if (err instanceof Error && 'fieldErrors' in err) {
        const apiErr = err as { fieldErrors(): Record<string, string> };
        setFieldErrors(apiErr.fieldErrors());
      } else {
        setError(err instanceof Error ? err.message : 'Calculation failed');
      }
      setResult(null);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    try {
      await apiRequest('/risk/presets', {
        method: 'POST',
        body: { ...state, name: presetName.trim() },
      });
      setPresetName('');
      // Could show toast here
    } catch (err) {
      console.error('Failed to save preset:', err);
    }
  };

  const account = accounts.find((a) => a.id === state.accountId);
  const currency = account?.currency || 'USD';

  if (loadingAccounts) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        <span className="sr-only">Loading accounts…</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text">Risk Calculator</h1>
        <p className="text-text-muted">
          Calculate position size, risk/reward, and projected profit from your trade setup.
        </p>
      </header>

      {/* Account & Balance Section */}
      <Card title="Account & Risk" subtitle="Select account and risk parameters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldShell label="Account" error={fieldErrors.accountId}>
            <Select
              value={state.accountId}
              onChange={(e) => handleAccountChange(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
              placeholder="Select account"
              aria-describedby="account-hint"
            />
            <p id="account-hint" className="text-xs text-text-muted mt-1">
              Balance and default risk are prefilled from the selected account.
            </p>
          </FieldShell>

          <FieldShell label="Balance" error={fieldErrors.balance}>
            <Input
              type="text"
              value={state.balance}
              onChange={(e) => handleChange('balance', e.target.value)}
              placeholder="10000"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Risk %" error={fieldErrors.riskPercent}>
            <Input
              type="text"
              value={state.riskPercent}
              onChange={(e) => handleChange('riskPercent', e.target.value)}
              placeholder="1.000"
              inputMode="decimal"
              disabled={loading}
              aria-describedby="risk-percent-hint"
            />
            <p id="risk-percent-hint" className="text-xs text-text-muted mt-1">
              Or enter risk amount below. Exactly one is required.
            </p>
          </FieldShell>

          <FieldShell label="Risk Amount" error={fieldErrors.riskAmount}>
            <Input
              type="text"
              value={state.riskAmount}
              onChange={(e) => handleChange('riskAmount', e.target.value)}
              placeholder="100.00"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>
        </div>
      </Card>

      {/* Trade Setup Section */}
      <Card title="Trade Setup" subtitle="Entry, stop loss, and take profit">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldShell label="Direction" error={fieldErrors.direction}>
            <Select
              value={state.direction}
              onChange={(e) => handleChange('direction', e.target.value as 'long' | 'short')}
              options={DIRECTION_OPTIONS}
            />
          </FieldShell>

          <FieldShell label="Entry Price" error={fieldErrors.entryPrice}>
            <Input
              type="text"
              value={state.entryPrice}
              onChange={(e) => handleChange('entryPrice', e.target.value)}
              placeholder="2415.33"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Stop Loss" error={fieldErrors.stopLoss}>
            <Input
              type="text"
              value={state.stopLoss}
              onChange={(e) => handleChange('stopLoss', e.target.value)}
              placeholder="2412.83"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Take Profit (optional)" error={fieldErrors.takeProfit}>
            <Input
              type="text"
              value={state.takeProfit}
              onChange={(e) => handleChange('takeProfit', e.target.value)}
              placeholder="2421.33"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>
        </div>
      </Card>

      {/* Instrument Specs Section */}
      <Card title="Instrument Specification" subtitle="Broker, symbol, and lot sizing parameters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldShell label="Broker / Symbol">
            <Select
              value={`${state.broker}|${state.symbol}`}
              onChange={(e) => {
                const [broker, symbol] = e.target.value.split('|');
                handleChange('broker', broker);
                handleChange('symbol', symbol);
              }}
              options={BROKER_SYMBOL_PRESETS.map((p) => ({
                value: `${p.broker}|${p.symbol}`,
                label: p.label,
              }))}
            />
          </FieldShell>

          <FieldShell label="Contract Size" error={fieldErrors.contractSize}>
            <Input
              type="text"
              value={state.contractSize}
              onChange={(e) => handleChange('contractSize', e.target.value)}
              placeholder="1"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Lot Step" error={fieldErrors.lotStep}>
            <Input
              type="text"
              value={state.lotStep}
              onChange={(e) => handleChange('lotStep', e.target.value)}
              placeholder="0.01"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Min Lot" error={fieldErrors.minLot}>
            <Input
              type="text"
              value={state.minLot}
              onChange={(e) => handleChange('minLot', e.target.value)}
              placeholder="0.01"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Max Lot" error={fieldErrors.maxLot}>
            <Input
              type="text"
              value={state.maxLot}
              onChange={(e) => handleChange('maxLot', e.target.value)}
              placeholder="100"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>

          <FieldShell label="Pip Value (optional)" error={fieldErrors.pipValue}>
            <Input
              type="text"
              value={state.pipValue}
              onChange={(e) => handleChange('pipValue', e.target.value)}
              placeholder="Auto"
              inputMode="decimal"
              disabled={loading}
            />
          </FieldShell>
        </div>
      </Card>

      {/* Calculate Button */}
      <div className="flex gap-3">
        <Button onClick={handleCalculate} loading={loading} className="flex-1 sm:flex-none">
          Calculate
        </Button>
        {result && (
          <Button variant="outline" onClick={() => setResult(null)}>
            Clear
          </Button>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <>
          {warnings.length > 0 && (
            <Card className="border-negative/30 bg-negative-soft/50">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-negative">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zM7.5 4.5a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm0 7a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-1.5 0v-1.5z" />
                  </svg>
                  <span className="font-medium">Warnings</span>
                </div>
                <ul className="ml-6 list-disc text-sm text-text-muted space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Stop Distance"
              value={result.slDistance}
              icon="📏"
            />
            <StatCard
              label="Risk Amount"
              value={formatMoney(result.riskAmount, currency)}
              icon="⚠️"
            />
            <StatCard
              label="Exact Lot"
              value={parseFloat(result.exactLot).toFixed(8)}
              icon="🎯"
            />
            <StatCard
              label="Recommended Lot"
              value={result.recommendedLot}
              highlight
              icon="✅"
            />

            <StatCard
              label="Actual Risk"
              value={formatMoney(result.actualRisk, currency)}
              icon="💰"
            />
            <StatCard
              label="Risk % (Actual)"
              value={formatPercent(result.riskPercentActual)}
              icon="📊"
            />
            <StatCard
              label="R:R Ratio"
              value={result.rrRatio}
              icon="⚖️"
            />
            <StatCard
              label="Potential Profit"
              value={formatMoney(result.potentialProfit, currency)}
              positive
              icon="📈"
            />
          </div>

          {/* Save Preset */}
          <Card className="border-accent/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-text-muted">Save as preset:</span>
                <Input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="My XAUUSDc Setup"
                  className="w-64"
                />
              </div>
              <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
                Save Preset
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* Error Display */}
      {error && !loading && (
        <div className="rounded-lg bg-negative-soft border border-negative p-4 text-negative" role="alert">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && !error && (
        <Card>
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-border-strong"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-text">No calculation yet</h3>
            <p className="mt-2 text-text-muted max-w-md mx-auto">
              Fill in your trade setup above and click Calculate to see position size,
              risk/reward ratio, and projected profit.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon?: string;
  highlight?: boolean;
  positive?: boolean;
}

function StatCard({ label, value, icon, highlight, positive }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        highlight
          ? 'border-accent bg-accent-soft'
          : positive
          ? 'border-positive/30 bg-positive-soft/50'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-text-muted">
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
      </div>
      <div className="mt-2 font-numeric text-2xl font-semibold leading-none">
        <span className={positive ? 'text-positive' : highlight ? 'text-accent' : 'text-text'}>
          {value}
        </span>
      </div>
    </div>
  );
}