import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { trades, tradingAccounts, tags, tradeTags } from '../../src/db/schema/trading.js';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';

const SAMPLE_ACCOUNT = {
  name: 'Exness XAUUSDc',
  broker: 'Exness',
  type: 'live' as const,
  currency: 'USD',
  startingBalance: '10000',
  timezone: 'Europe/Istanbul',
  defaultRiskPercent: 1,
  isDefault: true,
  notes: 'Primary live account',
};

const USER = {
  email: 'trader@example.com',
  password: 'correct horse battery',
  displayName: 'Ozeyid',
  timezone: 'Europe/Istanbul',
  baseCurrency: 'USD',
};

let app: Express;

function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function truncateTables(): Promise<void> {
  const db = getDb();
  await db.delete(tradeTags);
  await db.delete(trades);
  await db.delete(tags);
  await db.delete(tradingAccounts);
}

async function signedInAgent(emailOverride?: string) {
  const email = emailOverride ?? uniqueEmail();
  const agent = request.agent(app);
  const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
  const token = bootstrap.body.data.csrfToken as string;

  await agent
    .post('/api/v1/auth/register')
    .set('X-CSRF-Token', token)
    .send({ ...USER, email })
    .expect(201);

  return agent;
}

async function secondSignedInAgent() {
  return signedInAgent();
}

async function createAccount(
  agent: ReturnType<typeof request.agent>,
  overrides: Partial<typeof SAMPLE_ACCOUNT> = {}
): Promise<{ id: string; token: string }> {
  const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
  const token = bootstrap.body.data.csrfToken as string;

  const response = await agent
    .post('/api/v1/trading-accounts')
    .set('X-CSRF-Token', token)
    .send({ ...SAMPLE_ACCOUNT, ...overrides })
    .expect(201);

  return { id: response.body.data.id, token };
}

async function createTrade(
  agent: ReturnType<typeof request.agent>,
  accountId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

  // Create trade as 'open' first
  const createResponse = await agent
    .post('/api/v1/trades')
    .set('X-CSRF-Token', token)
    .send({
      accountId,
      symbol: 'XAUUSDc',
      broker: 'Exness',
      direction: 'long',
      quantity: '1.00',
      entryPrice: '2400.00',
      stopLoss: '2390.00',
      takeProfit: '2420.00',
      entryTime: new Date().toISOString(),
      status: 'open',
      fees: '0',
      swap: '0',
      ...overrides,
    })
    .expect(201);

  const tradeId = createResponse.body.data.id;

  // Close the trade if status should be closed
  const finalStatus = overrides.status ?? 'closed';
  if (finalStatus === 'closed') {
    const closeToken = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;
    await agent
      .post(`/api/v1/trades/${tradeId}/close`)
      .set('X-CSRF-Token', closeToken)
      .send({
        exitPrice: overrides.exitPrice ?? '2410.00',
        exitTime: overrides.exitTime ?? new Date().toISOString(),
        fees: overrides.fees ?? '0',
      })
      .expect(204);
  }

  return tradeId;
}

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  resetRateLimitStores();
  await truncateTables();
});

describe('POST /analytics/trades/export', () => {
  it('exports trades as CSV with default columns', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, { symbol: 'XAUUSDc', direction: 'long', exitPrice: '2410.00' });
    await createTrade(agent, accountId, { symbol: 'EURUSD', direction: 'short', exitPrice: '1.0850', entryPrice: '1.0900', stopLoss: '1.0950' });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({ format: 'csv', columns: ['symbol', 'direction', 'entryPrice', 'exitPrice', 'pnl', 'rMultiple'] })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('.csv');

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 trades

    const header = lines[0];
    expect(header).toContain('Symbol');
    expect(header).toContain('Direction');
    expect(header).toContain('Entry Price');
    expect(header).toContain('Exit Price');
    expect(header).toContain('P&L');
    expect(header).toContain('R Multiple');
  });

  it('exports with all available columns when specified', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId);

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const allColumns = [
      'id', 'accountId', 'accountName', 'symbol', 'direction', 'status', 'session',
      'quantity', 'entryPrice', 'exitPrice', 'stopLoss', 'takeProfit', 'entryTime',
      'exitTime', 'contractSize', 'plannedRisk', 'riskPercent', 'fees', 'swap',
      'pnl', 'rMultiple', 'mae', 'mfe', 'title', 'mistake', 'followedPlan',
      'brokeRules', 'strategyName', 'tags', 'durationMinutes', 'createdAt', 'updatedAt',
    ];

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({ format: 'csv', columns: allColumns })
      .expect(200);

    const csv = response.text;
    const header = csv.trim().split('\n')[0];
    expect(header.split(',').length).toBe(allColumns.length);
  });

  it('applies date range filters to export', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const today = new Date().toISOString();

    await createTrade(agent, accountId, { entryTime: yesterday, symbol: 'XAUUSDc' });
    await createTrade(agent, accountId, { entryTime: today, symbol: 'EURUSD' });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const fromDate = new Date().toISOString().split('T')[0];

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol'],
        filters: { from: fromDate },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2); // header + 1 trade (today only)
    expect(lines[1]).toContain('EURUSD');
  });

  it('applies symbol filter to export', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, { symbol: 'XAUUSDc' });
    await createTrade(agent, accountId, { symbol: 'EURUSD' });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol'],
        filters: { symbol: ['XAUUSDc'] },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('XAUUSDc');
    expect(lines[1]).not.toContain('EURUSD');
  });

  it('applies direction filter to export', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, { direction: 'long' });
    await createTrade(agent, accountId, { direction: 'short', entryPrice: '1.0900', stopLoss: '1.0950', exitPrice: '1.0850' });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol', 'direction'],
        filters: { direction: ['long'] },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('Long');
    expect(lines[1]).not.toContain('Short');
  });

  it('applies status filter to export', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, { status: 'closed' });
    await createTrade(agent, accountId, { status: 'open', exitPrice: null, exitTime: null });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol', 'status'],
        filters: { status: ['closed'] },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('closed');
    expect(lines[1]).not.toContain('open');
  });

  it('applies session filter to export', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    // London session (07:00-16:00 UTC)
    await createTrade(agent, accountId, { entryTime: '2026-01-15T10:00:00.000Z' });
    // Tokyo session (00:00-09:00 UTC)
    await createTrade(agent, accountId, { entryTime: '2026-01-15T03:00:00.000Z' });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol', 'session'],
        filters: { session: ['london'] },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('london');
  });

  it('applies brokeRules filter to export', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, { brokeRules: false });
    await createTrade(agent, accountId, { brokeRules: true });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol', 'brokeRules'],
        filters: { brokeRules: true },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('true');
  });

  it('escapes CSV values containing commas, quotes, and newlines', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, {
      title: 'Trade with, comma',
      mistake: 'Mistake with "quotes"',
    });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol', 'title', 'mistake'],
        filters: {},
      })
      .expect(200);

    const csv = response.text;
    expect(csv).toContain('"Trade with, comma"');
    expect(csv).toContain('"Mistake with ""quotes"""');
  });

  it('returns empty CSV with headers when no trades match filters', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);

    await createTrade(agent, accountId, { symbol: 'XAUUSDc' });

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({
        format: 'csv',
        columns: ['symbol'],
        filters: { symbol: ['NONEXISTENT'] },
      })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1); // header only
    expect(lines[0]).toContain('Symbol');
  });

  it('rejects invalid column names', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);
    await createTrade(agent, accountId);

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .send({
        format: 'csv',
        columns: ['invalidColumn'],
      })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/v1/analytics/trades/export')
      .send({ format: 'csv', columns: ['symbol'] })
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('requires CSRF token', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);
    await createTrade(agent, accountId);

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .send({ format: 'csv', columns: ['symbol'] })
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_FAILED');
  });

  it('enforces ownership - cannot export another user trades', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id: accountId } = await createAccount(agent1);
    await createTrade(agent1, accountId);

    const token2 = (await agent2.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    // agent2 has no trades, so export will be empty (not 404 since endpoint doesn't check ownership for empty results)
    const response = await agent2
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token2)
      .set('Accept', 'text/csv')
      .send({ format: 'csv', columns: ['symbol'] })
      .expect(200);

    const csv = response.text;
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1); // header only
  });

  it('includes Cache-Control: no-store header', async () => {
    const agent = await signedInAgent();
    const { id: accountId } = await createAccount(agent);
    await createTrade(agent, accountId);

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/analytics/trades/export')
      .set('X-CSRF-Token', token)
      .set('Accept', 'text/csv')
      .send({ format: 'csv', columns: ['symbol'] })
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
  });
});