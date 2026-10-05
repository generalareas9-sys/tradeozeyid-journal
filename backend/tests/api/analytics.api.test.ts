import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { trades, tradingAccounts, strategies, tags, tradeTags, tradeReviews } from '../../src/db/schema/trading.js';
import { generateId } from '../../src/lib/ids.js';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';

/**
 * Analytics API tests (api-spec.md §9.8).
 *
 * Runs in cookie mode (production construction) with a real database.
 * Ownership isolation and filter behavior are exercised through Supertest agents that carry cookies.
 */

const USER = {
  email: 'trader@example.com',
  password: 'correct horse battery',
  displayName: 'Ozeyid',
  timezone: 'Europe/Istanbul',
  baseCurrency: 'USD',
};

const ACCOUNT_SAMPLE = {
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

let app: Express;

async function truncateAnalyticsTables(): Promise<void> {
  const db = getDb();
  await db.delete(tradeReviews);
  await db.delete(tradeTags);
  await db.delete(trades);
  await db.delete(tags);
  await db.delete(strategies);
  await db.delete(tradingAccounts);
}

function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
  overrides: Partial<typeof ACCOUNT_SAMPLE> = {}
): Promise<{ id: string; token: string }> {
  const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
  const token = bootstrap.body.data.csrfToken as string;

  const response = await agent
    .post('/api/v1/trading-accounts')
    .set('X-CSRF-Token', token)
    .send({ ...ACCOUNT_SAMPLE, ...overrides })
    .expect(201);

  return { id: response.body.data.id, token };
}

async function createTrades(
  agent: ReturnType<typeof request.agent>,
  accountId: string,
  count: number,
  options: {
    baseDate?: Date;
    pnlPattern?: 'win' | 'loss' | 'alternate';
    symbol?: string;
    direction?: 'long' | 'short';
    session?: 'sydney' | 'tokyo' | 'london' | 'new_york';
    strategyId?: string;
    stopLoss?: string;
    takeProfit?: string;
  } = {}
) {
  const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
  const token = bootstrap.body.data.csrfToken as string;
  const userId = (await agent.get('/api/v1/auth/me')).body.data.id;

  const baseDate = options.baseDate ?? new Date('2026-01-15T10:00:00Z');
  const symbol = options.symbol ?? 'XAUUSDc';
  const direction = options.direction ?? 'long';
  const session = options.session ?? 'london';
  const stopLoss = options.stopLoss ?? (direction === 'short' ? '2010.0000000000' : '1990.0000000000');
  const takeProfit = options.takeProfit ?? (direction === 'short' ? '1990.0000000000' : '2020.0000000000');

  const tradeIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const entryTime = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    const exitTime = new Date(entryTime.getTime() + 60 * 60 * 1000);

    let pnl: string;
    let exitPrice: string;
    if (options.pnlPattern === 'win') {
      pnl = '50.0000000000';
      exitPrice = '2010.0000000000';
    } else if (options.pnlPattern === 'loss') {
      pnl = '-30.0000000000';
      exitPrice = '1990.0000000000';
    } else {
      // alternate
      pnl = i % 2 === 0 ? '50.0000000000' : '-30.0000000000';
      exitPrice = i % 2 === 0 ? '2010.0000000000' : '1990.0000000000';
    }

    const tradeId = generateId();
    tradeIds.push(tradeId);

    const rMultiple = parseFloat(pnl) / 10;

    await getDb().insert(trades).values({
      id: tradeId,
      userId,
      accountId,
      symbol: symbol.toUpperCase(),
      direction,
      status: 'closed',
      session,
      quantity: '1.00000000',
      entryPrice: '2000.0000000000',
      exitPrice,
      stopLoss,
      takeProfit,
      entryTime,
      exitTime,
      contractSize: '1.0000000000',
      plannedRisk: '10.0000000000',
      riskPercent: '1.000',
      fees: '1.0000000000',
      swap: '0.0000000000',
      pnl,
      rMultiple: rMultiple.toFixed(4),
      mae: '0.0000000000',
      mfe: '10.0000000000',
    });
  }

  return tradeIds;
}

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  resetRateLimitStores();
  await truncateAnalyticsTables();
});

describe('GET /analytics/summary', () => {
  it('returns metrics for closed trades', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);
    await createTrades(agent, id, 10, { pnlPattern: 'alternate' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/summary')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data).toMatchObject({
      currency: 'USD',
      totalTrades: 10,
      closedTrades: 10,
      openTrades: 0,
    });
    expect(typeof response.body.data.netPnl).toBe('string');
    expect(typeof response.body.data.winRate).toBe('number');
    expect(typeof response.body.data.lossRate).toBe('number');
    expect(response.body.data.profitFactor).toBeTypeOf('string');
    expect(typeof response.body.data.averageR).toBe('string');
    expect(typeof response.body.data.averageWin).toBe('string');
    expect(typeof response.body.data.averageLoss).toBe('string');
    expect(typeof response.body.data.maxDrawdownPercent).toBe('number');
    expect(typeof response.body.data.maxDrawdownAmount).toBe('string');
    expect(typeof response.body.data.totalR).toBe('string');
  });

  it('returns zeros for empty dataset', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/summary')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data.netPnl).toBe('0.0000000000');
    expect(response.body.data.winRate).toBe(0);
    expect(response.body.data.lossRate).toBe(0);
    expect(response.body.data.profitFactor).toBeNull();
    expect(response.body.data.averageR).toBe('0.0000');
  });

  it('filters by accountId', async () => {
    const agent = await signedInAgent();
    const { id: id1 } = await createAccount(agent);
    const { id: id2 } = await createAccount(agent, { name: 'Second Account', isDefault: false });

    await createTrades(agent, id1, 5, { pnlPattern: 'win' });
    await createTrades(agent, id2, 5, { pnlPattern: 'loss' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/summary')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data.closedTrades).toBe(5);
    expect(parseFloat(response.body.data.netPnl)).toBeGreaterThan(0);
  });

  it('filters by date range', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    // Create trades on different dates
    await createTrades(agent, id, 3, {
      baseDate: new Date('2026-01-15T10:00:00Z'),
      pnlPattern: 'win',
    });
    await createTrades(agent, id, 2, {
      baseDate: new Date('2026-02-15T10:00:00Z'),
      pnlPattern: 'loss',
    });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/summary?from=2026-01-01&to=2026-01-31')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data.closedTrades).toBe(3);
  });

  it('enforces ownership - cannot see another user\'s analytics', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    await createTrades(agent1, id, 5, { pnlPattern: 'win' });

    const bootstrap = await agent2.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    // Should return empty for user with no trades, not 404
    const response = await agent2
      .get('/api/v1/dashboard/analytics/summary')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data.closedTrades).toBe(0);
  });
});

describe('GET /analytics/equity-curve', () => {
  it('returns equity curve points', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);
    await createTrades(agent, id, 5, { pnlPattern: 'alternate' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/equity-curve')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0]).toHaveProperty('timestamp');
    expect(response.body.data[0]).toHaveProperty('date');
    expect(response.body.data[0]).toHaveProperty('pnl');
    expect(response.body.data[0]).toHaveProperty('equity');
    expect(response.body.data[0]).toHaveProperty('drawdownPercent');
  });

  it('supports bucket parameter', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);
    await createTrades(agent, id, 5, { pnlPattern: 'alternate' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/equity-curve?bucket=day')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe('GET /analytics/drawdown', () => {
  it('returns drawdown series and max values', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);
    await createTrades(agent, id, 10, { pnlPattern: 'alternate' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/drawdown')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data).toHaveProperty('maxPercent');
    expect(response.body.data).toHaveProperty('maxAmount');
    expect(response.body.data).toHaveProperty('peakAt');
    expect(response.body.data).toHaveProperty('troughAt');
    expect(response.body.data).toHaveProperty('currentPercent');
    expect(Array.isArray(response.body.data.series)).toBe(true);
  });
});

describe('GET /analytics/breakdown', () => {
  it('returns breakdown by strategy', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    // Create strategy
    const stratBootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const stratToken = stratBootstrap.body.data.csrfToken as string;

    const stratResponse = await agent
      .post('/api/v1/strategies')
      .set('X-CSRF-Token', stratToken)
      .send({ name: 'Test Strategy', category: 'test', status: 'active' })
      .expect(201);
    const strategyId = stratResponse.body.data.id;

    await createTrades(agent, id, 5, { pnlPattern: 'win', strategyId });
    await createTrades(agent, id, 3, { pnlPattern: 'loss' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/breakdown?dimension=strategy')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0]).toHaveProperty('key');
    expect(response.body.data[0]).toHaveProperty('tradeCount');
    expect(response.body.data[0]).toHaveProperty('closedTrades');
    expect(response.body.data[0]).toHaveProperty('netPnl');
    expect(response.body.data[0]).toHaveProperty('winRate');
    expect(response.body.data[0]).toHaveProperty('profitFactor');
    expect(response.body.data[0]).toHaveProperty('averageR');
    expect(response.body.data[0]).toHaveProperty('averageWin');
    expect(response.body.data[0]).toHaveProperty('averageLoss');
  });

  it('returns breakdown by symbol', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    await createTrades(agent, id, 5, { symbol: 'XAUUSDc', pnlPattern: 'win' });
    await createTrades(agent, id, 3, { symbol: 'EURUSD', pnlPattern: 'loss' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/breakdown?dimension=symbol')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data.length).toBe(2);
    const symbols = response.body.data.map((d: { key: string }) => d.key);
    expect(symbols).toContain('XAUUSDC');
    expect(symbols).toContain('EURUSD');
  });

  it('returns breakdown by session', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    await createTrades(agent, id, 3, { session: 'london', pnlPattern: 'win' });
    await createTrades(agent, id, 2, { session: 'new_york', pnlPattern: 'loss' });
    await createTrades(agent, id, 1, { session: 'tokyo', pnlPattern: 'win' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/breakdown?dimension=session')
      .set('X-CSRF-Token', token)
      .expect(200);

    const sessions = response.body.data.map((d: { key: string }) => d.key);
    expect(sessions).toContain('london');
    expect(sessions).toContain('new_york');
    expect(sessions).toContain('tokyo');
  });

  it('returns breakdown by direction', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    // Create long trades (stop loss below entry, take profit above)
    await createTrades(agent, id, 4, { direction: 'long', pnlPattern: 'win' });
    // Create short trades (stop loss above entry, take profit below for short)
    await createTrades(agent, id, 2, { 
      direction: 'short', 
      pnlPattern: 'loss', 
      stopLoss: '2010.0000000000',
      takeProfit: '1990.0000000000'  // below entry for short
    });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/breakdown?dimension=direction')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data.length).toBe(2);
    const directions = response.body.data.map((d: { key: string }) => d.key);
    expect(directions).toContain('long');
    expect(directions).toContain('short');
  });

  it('returns breakdown by tag', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    // Create tag
    const tagBootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const tagToken = tagBootstrap.body.data.csrfToken as string;

    const tagResponse = await agent
      .post('/api/v1/tags')
      .set('X-CSRF-Token', tagToken)
      .send({ name: 'Test Tag', category: 'setup' })
      .expect(201);
    const tagId = tagResponse.body.data.id;

    // Create trades and tag some
    const tradeIds = await createTrades(agent, id, 4, { pnlPattern: 'win' });
    await createTrades(agent, id, 2, { pnlPattern: 'loss' });

    // Tag first 2 trades
    const tagTradeBootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const tagTradeToken = tagTradeBootstrap.body.data.csrfToken as string;

    await agent
      .put(`/api/v1/trades/${tradeIds[0]}/tags`)
      .set('X-CSRF-Token', tagTradeToken)
      .send({ tagIds: [tagId] })
      .expect(204);

    await agent
      .put(`/api/v1/trades/${tradeIds[1]}/tags`)
      .set('X-CSRF-Token', tagTradeToken)
      .send({ tagIds: [tagId] })
      .expect(204);

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/breakdown?dimension=tag')
      .set('X-CSRF-Token', token)
      .expect(200);

    const tags = response.body.data.map((d: { key: string }) => d.key);
    expect(tags).toContain('Test Tag');
  });

  it('enforces ownership', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    await createTrades(agent1, id, 5, { pnlPattern: 'win' });

    const bootstrap = await agent2.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent2
      .get('/api/v1/dashboard/analytics/breakdown?dimension=strategy')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data).toHaveLength(0);
  });
});

describe('GET /analytics/calendar', () => {
  it('returns calendar data by date', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    await createTrades(agent, id, 3, {
      baseDate: new Date('2026-01-15T10:00:00Z'),
      pnlPattern: 'win',
    });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/calendar')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0]).toHaveProperty('date');
    expect(response.body.data[0]).toHaveProperty('pnl');
    expect(response.body.data[0]).toHaveProperty('tradeCount');
    expect(response.body.data[0]).toHaveProperty('winRate');
    expect(response.body.data[0]).toHaveProperty('rMultiple');
    expect(response.body.data[0]).toHaveProperty('hasJournal');
  });
});

describe('GET /analytics/streaks', () => {
  it('returns streak data', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    // Create a win streak of 3
    await createTrades(agent, id, 3, {
      baseDate: new Date('2026-01-15T10:00:00Z'),
      pnlPattern: 'win',
    });
    // Then a loss
    await createTrades(agent, id, 1, {
      baseDate: new Date('2026-01-18T10:00:00Z'),
      pnlPattern: 'loss',
    });
    // Then another win
    await createTrades(agent, id, 1, {
      baseDate: new Date('2026-01-19T10:00:00Z'),
      pnlPattern: 'win',
    });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/streaks')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data).toHaveProperty('currentWinStreak');
    expect(response.body.data).toHaveProperty('currentLossStreak');
    expect(response.body.data).toHaveProperty('maxWinStreak');
    expect(response.body.data).toHaveProperty('maxLossStreak');
    expect(response.body.data).toHaveProperty('maxDrawdownStreak');
    expect(Array.isArray(response.body.data.winStreakHistory)).toBe(true);
    expect(Array.isArray(response.body.data.lossStreakHistory)).toBe(true);
  });
});

describe('GET /analytics/sessions', () => {
  it('returns session and hour breakdown', async () => {
    const agent = await signedInAgent();
    const { id } = await createAccount(agent);

    await createTrades(agent, id, 3, { session: 'london', pnlPattern: 'win' });
    await createTrades(agent, id, 2, { session: 'new_york', pnlPattern: 'loss' });
    await createTrades(agent, id, 1, { session: 'tokyo', pnlPattern: 'win' });

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .get('/api/v1/dashboard/analytics/sessions')
      .set('X-CSRF-Token', token)
      .expect(200);

    expect(response.body.data).toHaveProperty('bySession');
    expect(response.body.data).toHaveProperty('byHour');
    expect(Array.isArray(response.body.data.bySession)).toBe(true);
    expect(Array.isArray(response.body.data.byHour)).toBe(true);
    expect(response.body.data.byHour.length).toBe(24);

    const sessions = response.body.data.bySession.map((s: { key: string }) => s.key);
    expect(sessions).toContain('london');
    expect(sessions).toContain('new_york');
    expect(sessions).toContain('tokyo');
    expect(sessions).toContain('sydney');
  });
});