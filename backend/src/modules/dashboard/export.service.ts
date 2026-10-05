import * as repo from './export.repository.js';
import type { ExportRow, ExportColumn } from './export.repository.js';

export interface ExportResult {
  csv: string;
  filename: string;
}

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: 'Trade ID',
  accountId: 'Account ID',
  accountName: 'Account',
  symbol: 'Symbol',
  direction: 'Direction',
  status: 'Status',
  session: 'Session',
  quantity: 'Quantity',
  entryPrice: 'Entry Price',
  exitPrice: 'Exit Price',
  stopLoss: 'Stop Loss',
  takeProfit: 'Take Profit',
  entryTime: 'Entry Time (UTC)',
  exitTime: 'Exit Time (UTC)',
  contractSize: 'Contract Size',
  plannedRisk: 'Planned Risk',
  riskPercent: 'Risk %',
  fees: 'Fees',
  swap: 'Swap',
  pnl: 'P&L',
  rMultiple: 'R Multiple',
  mae: 'MAE',
  mfe: 'MFE',
  title: 'Title',
  mistake: 'Mistake',
  followedPlan: 'Followed Plan',
  brokeRules: 'Broke Rules',
  strategyName: 'Strategy',
  tags: 'Tags',
  durationMinutes: 'Duration (min)',
  createdAt: 'Created At (UTC)',
  updatedAt: 'Updated At (UTC)',
};

function escapeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatRow(row: ExportRow, columns: ExportColumn[]): string {
  return columns.map(col => {
    let value = row[col];
    if (col === 'entryTime' || col === 'exitTime' || col === 'createdAt' || col === 'updatedAt') {
      value = value ? (value as Date).toISOString() : '';
    }
    if (col === 'followedPlan' || col === 'brokeRules') {
      value = value === null ? '' : value ? 'true' : 'false';
    }
    if (col === 'direction') {
      value = value === 'long' ? 'Long' : value === 'short' ? 'Short' : value;
    }
    return escapeCsvValue(value as string | null | undefined);
  }).join(',');
}

export async function generateCsvExport(
  userId: string,
  columns: ExportColumn[],
  filters: repo.ExportRow extends { timezone?: string } ? never : {
    from?: Date;
    to?: Date;
    accountId?: string | string[];
    symbol?: string[];
    direction?: string[];
    strategyId?: string[];
    tagId?: string[];
    session?: string[];
    status?: string[];
    minR?: string;
    maxR?: string;
    minPnl?: string;
    maxPnl?: string;
    emotionTagId?: string;
    brokeRules?: boolean;
    hasAttachments?: boolean;
    q?: string;
    timezone?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  } = {}
): Promise<ExportResult> {
  const rows = await repo.getExportTrades(userId, filters);

  const header = columns.map(col => COLUMN_LABELS[col]).join(',');
  const dataRows = rows.map(row => formatRow(row, columns));

  const csv = [header, ...dataRows].join('\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = `trades-export-${timestamp}.csv`;

  return { csv, filename };
}