import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDb } from '../../src/db/index.js';

const app = createApp();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterAll(async () => {
  await closeDb();
});

describe('GET /api/v1/health', () => {
  it('answers 200 with the documented envelope when PostgreSQL answers SELECT 1', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.data).toEqual({
      status: 'ok',
      version: '0.1.0',
      database: 'ok',
      uptimeSeconds: expect.any(Number),
    });
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });

  it('returns an X-Request-Id header matching the request id in the envelope', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });

  it('echoes an inbound X-Request-Id instead of generating a new one', async () => {
    const inbound = '11111111-2222-4333-8444-555555555555';
    const response = await request(app).get('/api/v1/health').set('X-Request-Id', inbound);

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe(inbound);
    expect(response.body.meta.requestId).toBe(inbound);
  });

  it('generates a UUID request id when the client sends none', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('never exposes a connection string, host, credential or stack trace', async () => {
    const response = await request(app).get('/api/v1/health');
    const serialised = JSON.stringify(response.body);

    expect(serialised).not.toContain('postgresql://');
    expect(serialised).not.toContain('DATABASE_URL');
    expect(serialised).not.toContain('127.0.0.1');
    expect(serialised).not.toContain('password');
  });

  it('does not require authentication or a CSRF token', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
  });

  it('returns 404 with the error envelope for an unknown route', async () => {
    const response = await request(app).get('/api/v1/healthz');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
  });
});