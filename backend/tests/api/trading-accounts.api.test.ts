import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/index.js';
import { tradingAccounts, trades } from '../../src/db/schema/trading.js';
import { resetRateLimitStores } from '../../src/middleware/rateLimit.js';
// eslint-disable-next-line no-unused-vars
import { generateId } from '../../src/lib/ids.js';

void generateId;

/**
 * Trading accounts API tests (api-spec.md §9.3).
 *
 * Runs in cookie mode (production construction) with a real database.
 * Ownership isolation and the default/single-name constraints are exercised
 * through Supertest agents that carry cookies.
 */

const SAMPLE = {
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

async function truncateTradingTables(): Promise<void> {
  const db = getDb();
  await db.delete(trades);
  await db.delete(tradingAccounts);
}

/** Generates a unique email for test isolation. */
function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

/** Registers a user and returns a fresh agent with an active session. */
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

/** Creates a second user with a different email. */
async function secondSignedInAgent() {
  return signedInAgent();
}

/** Creates an account via the API using a signed-in agent. */
async function createAccount(
  agent: ReturnType<typeof request.agent>,
  overrides: Partial<typeof SAMPLE> = {}
): Promise<{ id: string; token: string }> {
  const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
  const token = bootstrap.body.data.csrfToken as string;

  const response = await agent
    .post('/api/v1/trading-accounts')
    .set('X-CSRF-Token', token)
    .send({ ...SAMPLE, ...overrides })
    .expect(201);

  return { id: response.body.data.id, token };
}

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  resetRateLimitStores();
  await truncateTradingTables();
});

describe('GET /trading-accounts', () => {
  it('returns an empty list for a new user', async () => {
    const agent = await signedInAgent();

    const response = await agent.get('/api/v1/trading-accounts').expect(200);

    expect(response.body.data).toEqual([]);
  });

  it('returns the created account with computed fields', async () => {
    const agent = await signedInAgent();

    await createAccount(agent);

    const response = await agent.get('/api/v1/trading-accounts').expect(200);

    expect(response.body.data).toHaveLength(1);
    const account = response.body.data[0];
    expect(account.name).toBe(SAMPLE.name);
    expect(account.currentBalance).toBe('10000.0000000000');
    expect(account.tradeCount).toBe(0);
    expect(account.isDefault).toBe(true);
  });

  it('includes archived accounts when requested', async () => {
    const agent = await signedInAgent();

    const { id } = await createAccount(agent);
    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    await agent
      .post(`/api/v1/trading-accounts/${id}/archive`)
      .set('X-CSRF-Token', token)
      .expect(204);

    const defaultList = await agent.get('/api/v1/trading-accounts').expect(200);
    expect(defaultList.body.data).toHaveLength(0);

    const withArchived = await agent
      .get('/api/v1/trading-accounts?includeArchived=true')
      .expect(200);

    expect(withArchived.body.data).toHaveLength(1);
    expect(withArchived.body.data[0].status).toBe('archived');
  });

  it('filters by status', async () => {
    const agent = await signedInAgent();

    await createAccount(agent);

    const active = await agent.get('/api/v1/trading-accounts?status=active').expect(200);
    expect(active.body.data).toHaveLength(1);

    const archived = await agent.get('/api/v1/trading-accounts?status=archived').expect(200);
    expect(archived.body.data).toHaveLength(0);
  });
});

describe('POST /trading-accounts', () => {
  it('creates the first account and marks it default automatically', async () => {
    const agent = await signedInAgent();

    const bootstrap = await agent.get('/api/v1/auth/csrf').expect(200);
    const token = bootstrap.body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/trading-accounts')
      .set('X-CSRF-Token', token)
      .send(SAMPLE)
      .expect(201);

    expect(response.body.data.isDefault).toBe(true);
    expect(response.body.data.name).toBe(SAMPLE.name);
    expect(response.body.data.startingBalance).toBe('10000.0000000000');
    expect(response.body.data.currentBalance).toBe('10000.0000000000');
    expect(response.body.data.tradeCount).toBe(0);
  });

  it('rejects a duplicate name (case-insensitive)', async () => {
    const agent = await signedInAgent();

    await createAccount(agent);
    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/trading-accounts')
      .set('X-CSRF-Token', token)
      .send({ ...SAMPLE, name: SAMPLE.name.toLowerCase() })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.message).toContain('already exists');
  });

  it('rejects a negative starting balance', async () => {
    const agent = await signedInAgent();

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/trading-accounts')
      .set('X-CSRF-Token', token)
      .send({ ...SAMPLE, startingBalance: '-100' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid currency code', async () => {
    const agent = await signedInAgent();

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/trading-accounts')
      .set('X-CSRF-Token', token)
      .send({ ...SAMPLE, currency: 'usd' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown IANA timezone', async () => {
    const agent = await signedInAgent();

    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/trading-accounts')
      .set('X-CSRF-Token', token)
      .send({ ...SAMPLE, timezone: 'Not/A/Zone' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a demo account with all fields', async () => {
    const agent = await signedInAgent();

    // Create a first account to be default
    await createAccount(agent, { name: 'First Account' });
    const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    const response = await agent
      .post('/api/v1/trading-accounts')
      .set('X-CSRF-Token', token)
      .send({
        ...SAMPLE,
        type: 'demo',
        broker: 'Demo Broker',
        currency: 'EUR',
        startingBalance: '50000',
        timezone: 'UTC',
        isDefault: false,
      })
      .expect(201);

    expect(response.body.data.type).toBe('demo');
    expect(response.body.data.currency).toBe('EUR');
    expect(response.body.data.startingBalance).toBe('50000.0000000000');
    expect(response.body.data.isDefault).toBe(false);
  });
});

describe('GET /trading-accounts/:id', () => {
  it('returns the account with computed fields', async () => {
    const agent = await signedInAgent();

    const { id } = await createAccount(agent);

    const response = await agent.get(`/api/v1/trading-accounts/${id}`).expect(200);

    expect(response.body.data.id).toBe(id);
    expect(response.body.data.currentBalance).toBe('10000.0000000000');
    expect(response.body.data.tradeCount).toBe(0);
  });

  it('returns 404 for an account owned by another user', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);

    await agent2.get(`/api/v1/trading-accounts/${id}`).expect(404);
  });

  it('returns 404 for a non-existent UUID', async () => {
    const agent = await signedInAgent();

    await agent.get('/api/v1/trading-accounts/0198a1b2-c3d4-e5f6-7890-abcdef123456').expect(404);
  });
});

describe('PATCH /trading-accounts/:id', () => {
  it('updates mutable fields', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);

    const response = await agent
      .patch(`/api/v1/trading-accounts/${id}`)
      .set('X-CSRF-Token', token)
      .send({ name: 'Renamed Account', notes: 'Updated notes' })
      .expect(200);

    expect(response.body.data.name).toBe('Renamed Account');
    expect(response.body.data.notes).toBe('Updated notes');
    expect(response.body.data.updatedAt).toBeTruthy();
  });

  it('rejects changing startingBalance when closed trades exist', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);

    // Insert a closed trade directly to simulate the conflict
    const userId = (await agent.get('/api/v1/auth/me')).body.data.id;
    await getDb().insert(trades).values({
      id: (() => generateId())(),
      userId,
      accountId: id,
      symbol: 'XAUUSDC',
      direction: 'long',
      status: 'closed',
      session: 'london',
      quantity: '1.0',
      entryPrice: '2000',
      exitPrice: '2010',
      stopLoss: '1990',
      takeProfit: '2020',
      entryTime: new Date(),
      exitTime: new Date(),
      contractSize: '1',
      plannedRisk: '10',
      riskPercent: 1,
      fees: '0',
      swap: '0',
      pnl: '10',
      rMultiple: '1',
      mae: '0',
      mfe: '10',
    } as unknown as typeof trades.$inferInsert);

    const response = await agent
      .patch(`/api/v1/trading-accounts/${id}`)
      .set('X-CSRF-Token', token)
      .send({ startingBalance: '20000' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.message).toContain('closed trades');
  });

  it('allows changing startingBalance when no closed trades exist', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);

    const response = await agent
      .patch(`/api/v1/trading-accounts/${id}`)
      .set('X-CSRF-Token', token)
      .send({ startingBalance: '20000' })
      .expect(200);

    expect(response.body.data.startingBalance).toBe('20000.0000000000');
  });

it('rejects a duplicate name', async () => {
    const agent = await signedInAgent();

    // Create two accounts without relying on auto-default, then set one as default
    const { id: id1 } = await createAccount(agent, { name: 'Account One', isDefault: false });
    const { id: id2 } = await createAccount(agent, { name: 'Account Two', isDefault: false });

    // Explicitly set the first as default
    await agent
      .post(`/api/v1/trading-accounts/${id1}/set-default`)
      .set('X-CSRF-Token', (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
      .expect(204);

    const response = await agent
      .patch(`/api/v1/trading-accounts/${id2}`)
      .set('X-CSRF-Token', (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
      .send({ name: 'Account One' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('allows changing currency', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);

    const response = await agent
      .patch(`/api/v1/trading-accounts/${id}`)
      .set('X-CSRF-Token', token)
      .send({ currency: 'EUR' })
      .expect(200);

    expect(response.body.data.currency).toBe('EUR');
  });
});

describe('POST /trading-accounts/:id/archive', () => {
  it('archives the account', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);

    await agent
      .post(`/api/v1/trading-accounts/${id}/archive`)
      .set('X-CSRF-Token', token)
      .expect(204);

    const response = await agent
      .get('/api/v1/trading-accounts?includeArchived=true')
      .expect(200);

    expect(response.body.data[0].status).toBe('archived');
    expect(response.body.data[0].deletedAt).toBeTruthy();
  });

  it('rejects archiving when closed trades exist', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);

    const userId = (await agent.get('/api/v1/auth/me')).body.data.id;
    await getDb().insert(trades).values({
      id: (() => generateId())(),
      userId,
      accountId: id,
      symbol: 'XAUUSDC',
      direction: 'long',
      status: 'closed',
      session: 'london',
      quantity: '1.0',
      entryPrice: '2000',
      exitPrice: '2010',
      stopLoss: '1990',
      takeProfit: '2020',
      entryTime: new Date(),
      exitTime: new Date(),
      contractSize: '1',
      plannedRisk: '10',
      riskPercent: 1,
      fees: '0',
      swap: '0',
      pnl: '10',
      rMultiple: '1',
      mae: '0',
      mfe: '10',
    } as unknown as typeof trades.$inferInsert);

    const response = await agent
      .post(`/api/v1/trading-accounts/${id}/archive`)
      .set('X-CSRF-Token', token)
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
    expect(response.body.error.message).toContain('closed trades');
  });

  it('returns 404 for another user\'s account', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    const token2 = (await agent2.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    await agent2
      .post(`/api/v1/trading-accounts/${id}/archive`)
      .set('X-CSRF-Token', token2)
      .expect(404);
  });
});

describe('POST /trading-accounts/:id/set-default', () => {
  it('sets the account as default and clears the previous one', async () => {
    const agent = await signedInAgent();

    await createAccount(agent, { name: 'First', isDefault: true });
    const { id, token } = await createAccount(agent, { name: 'Second', isDefault: false });

    await agent
      .post(`/api/v1/trading-accounts/${id}/set-default`)
      .set('X-CSRF-Token', token)
      .expect(204);

    const list = await agent.get('/api/v1/trading-accounts').expect(200);
    const accounts = list.body.data;

    expect(accounts.find((a: { name: string; isDefault: boolean }) => a.name === 'First')?.isDefault).toBe(false);
    expect(accounts.find((a: { name: string; isDefault: boolean }) => a.name === 'Second')?.isDefault).toBe(true);
  });

  it('rejects setting an archived account as default', async () => {
    const agent = await signedInAgent();

    const { id, token } = await createAccount(agent);
    await agent
      .post(`/api/v1/trading-accounts/${id}/archive`)
      .set('X-CSRF-Token', token)
      .expect(204);

    const response = await agent
      .post(`/api/v1/trading-accounts/${id}/set-default`)
      .set('X-CSRF-Token', (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken)
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for another user\'s account', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    const token2 = (await agent2.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    await agent2
      .post(`/api/v1/trading-accounts/${id}/set-default`)
      .set('X-CSRF-Token', token2)
      .expect(404);
  });
});

describe('ownership isolation', () => {
  it('never leaks another user\'s accounts in the list', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    await createAccount(agent1, { name: 'User1 Account' });
    await createAccount(agent2, { name: 'User2 Account' });

    const list1 = await agent1.get('/api/v1/trading-accounts').expect(200);
    const list2 = await agent2.get('/api/v1/trading-accounts').expect(200);

    expect(list1.body.data).toHaveLength(1);
    expect(list1.body.data[0].name).toBe('User1 Account');

    expect(list2.body.data).toHaveLength(1);
    expect(list2.body.data[0].name).toBe('User2 Account');
  });

  it('enforces ownership on PATCH', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    const token2 = (await agent2.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    await agent2
      .patch(`/api/v1/trading-accounts/${id}`)
      .set('X-CSRF-Token', token2)
      .send({ name: 'Stolen' })
      .expect(404);
  });

  it('enforces ownership on archive', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    const token2 = (await agent2.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    await agent2
      .post(`/api/v1/trading-accounts/${id}/archive`)
      .set('X-CSRF-Token', token2)
      .expect(404);
  });

  it('enforces ownership on set-default', async () => {
    const agent1 = await signedInAgent();
    const agent2 = await secondSignedInAgent();

    const { id } = await createAccount(agent1);
    const token2 = (await agent2.get('/api/v1/auth/csrf')).body.data.csrfToken as string;

    await agent2
      .post(`/api/v1/trading-accounts/${id}/set-default`)
      .set('X-CSRF-Token', token2)
      .expect(404);
  });
});