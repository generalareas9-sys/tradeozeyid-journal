import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb } from '../../src/db/index.js';
import { resetEnvCache } from '../../src/config/index.js';

/**
 * The 503 path is exercised against a real database endpoint that is not
 * listening — not a stub — so the behaviour under test is the real one
 * (api-spec.md §9.1: `503` with `database: "error"`).
 */
const UNREACHABLE_DATABASE_URL = 'postgresql://nobody:nobody@127.0.0.1:1/nonexistent';

afterEach(async () => {
  vi.unstubAllEnvs();
  resetEnvCache();
  await resetDb();
});

describe('GET /api/v1/health when PostgreSQL is unreachable', () => {
  it('answers 503 with database "error" and still echoes the request id', async () => {
    vi.stubEnv('DATABASE_URL_TEST', UNREACHABLE_DATABASE_URL);
    resetEnvCache();
    await resetDb();

    const response = await request(createApp()).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body.data.status).toBe('error');
    expect(response.body.data.database).toBe('error');
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('127.0.0.1');
    expect(serialised).not.toContain('nobody');

    await closeDb();
  });
});