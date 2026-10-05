import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeDb, getDb } from '../../src/db/index.js';
import { migrateToLatest, resetToEmpty } from '../../src/db/migrations/runner.js';
import { eq } from 'drizzle-orm';
import { users, journalEntries, reviews } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { createApp } from '../../src/app.js';

const app = createApp();

const user1 = { id: generateId(), email: 'jour1@test.com', password: 'password123', displayName: 'Jour1' };
const user2 = { id: generateId(), email: 'jour2@test.com', password: 'password123', displayName: 'Jour2' };

let user1Cookie: string;
let user2Cookie: string;
let user1Csrf: string;
let user2Csrf: string;

function getCsrfToken(cookies: string | string[]): string {
  const cookieString = Array.isArray(cookies) ? cookies.join('; ') : cookies;
  const match = cookieString.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

beforeAll(async () => {
  await resetToEmpty(getDb());
  await migrateToLatest(getDb());

  // Register users
  const reg1 = await request(app).post('/api/v1/auth/register').send({
    email: user1.email,
    password: user1.password,
    displayName: user1.displayName,
    timezone: 'UTC',
    baseCurrency: 'USD',
  });
  const setCookie1 = reg1.headers['set-cookie'];
user1Cookie = Array.isArray(setCookie1) ? setCookie1.join('; ') : (setCookie1 ?? '');
  user1Csrf = getCsrfToken(user1Cookie);

  const reg2 = await request(app).post('/api/v1/auth/register').send({
    email: user2.email,
    password: user2.password,
    displayName: user2.displayName,
    timezone: 'UTC',
    baseCurrency: 'USD',
  });
  const setCookie2 = reg2.headers['set-cookie'];
user2Cookie = Array.isArray(setCookie2) ? setCookie2.join('; ') : (setCookie2 ?? '');
  user2Csrf = getCsrfToken(user2Cookie);
});

afterAll(async () => {
  await closeDb();
});

describe('Journal API', () => {
  describe('POST /journal/entries', () => {
    it('creates a journal entry', async () => {
      const res = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-01',
          title: 'Test Entry',
          body: 'This is my journal entry',
          moodScore: 4,
          accountId: null,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    it('rejects duplicate date', async () => {
      const res = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-01',
          title: 'Another Entry',
          body: 'Duplicate date',
          moodScore: 3,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-02',
          body: '', // empty body
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/journal/entries')
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-03',
          body: 'No auth',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /journal/entries', () => {
    it('lists user entries', async () => {
      const res = await request(app)
        .get('/api/v1/journal/entries')
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.pagination).toBeDefined();
    });

    it('filters by date range', async () => {
      const res = await request(app)
        .get('/api/v1/journal/entries?from=2026-02-01&to=2026-02-05')
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      res.body.data.forEach((entry: any) => {
        expect(entry.entryDate >= '2026-02-01').toBe(true);
        expect(entry.entryDate <= '2026-02-05').toBe(true);
      });
    });

    it('returns only user\'s entries', async () => {
      // Create entry for user2
      await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user2Cookie)
        .set('X-CSRF-Token', user2Csrf)
        .send({
          entryDate: '2026-02-10',
          title: 'User 2 Entry',
          body: 'Private',
          moodScore: 3,
        });

      const res1 = await request(app)
        .get('/api/v1/journal/entries')
        .set('Cookie', user1Cookie);
      expect(res1.body.data.every((e: any) => e.userId === user1.id)).toBe(true);

      const res2 = await request(app)
        .get('/api/v1/journal/entries')
        .set('Cookie', user2Cookie);
      expect(res2.body.data.every((e: any) => e.userId === user2.id)).toBe(true);
    });
  });

  describe('GET /journal/entries/:id', () => {
    it('returns entry with emotions and trade summary', async () => {
      const createRes = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-15',
          title: 'Detail Test',
          body: 'Testing detail view',
          moodScore: 5,
        });

      const entryId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/journal/entries/${entryId}`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(entryId);
      expect(res.body.data.title).toBe('Detail Test');
      expect(res.body.data.emotions).toBeDefined();
      expect(res.body.data.tradeSummary).toBeDefined();
    });

    it('returns 404 for non-existent entry', async () => {
      const res = await request(app)
        .get('/api/v1/journal/entries/00000000-0000-0000-0000-000000000000')
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(404);
    });

    it('returns 404 for other user\'s entry', async () => {
      const createRes = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-20',
          title: 'Private',
          body: 'Secret',
        });

      const entryId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/journal/entries/${entryId}`)
        .set('Cookie', user2Cookie);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /journal/entries/:id', () => {
    it('updates entry fields', async () => {
      const createRes = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          entryDate: '2026-02-25',
          title: 'Original',
          body: 'Original body',
          moodScore: 3,
        });

      const entryId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/journal/entries/${entryId}`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          title: 'Updated',
          moodScore: 5,
        });

      expect(res.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/v1/journal/entries/${entryId}`)
        .set('Cookie', user1Cookie);

      expect(getRes.body.data.title).toBe('Updated');
      expect(getRes.body.data.moodScore).toBe(5);
    });

    it('rejects updating to existing date', async () => {
      // Create two entries
      const res1 = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ entryDate: '2026-03-01', title: 'A', body: 'A', moodScore: 1 });

      const res2 = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ entryDate: '2026-03-02', title: 'B', body: 'B', moodScore: 2 });

      const entryId1 = res1.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/journal/entries/${entryId1}`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ entryDate: '2026-03-02' });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /journal/entries/:id', () => {
    it('soft deletes entry', async () => {
      const createRes = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ entryDate: '2026-03-05', title: 'To Delete', body: 'Delete me', moodScore: 1 });

      const entryId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/journal/entries/${entryId}`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf);

      expect(res.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/v1/journal/entries/${entryId}`)
        .set('Cookie', user1Cookie);

      expect(getRes.status).toBe(404);
    });
  });

  describe('Journal Emotions', () => {
    it('creates and lists emotions', async () => {
      const createRes = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ entryDate: '2026-03-10', title: 'Emotion Test', body: 'Test', moodScore: 3 });

      const entryId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/journal/entries/${entryId}/emotions`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ emotion: 'FOMO', intensity: 4, phase: 'before' });

      const res = await request(app)
        .get(`/api/v1/journal/entries/${entryId}/emotions`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].emotion).toBe('FOMO');
      expect(res.body.data[0].intensity).toBe(4);
    });

    it('deletes emotion', async () => {
      const createRes = await request(app)
        .post('/api/v1/journal/entries')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ entryDate: '2026-03-11', title: 'Delete Emotion', body: 'Test', moodScore: 2 });

      const entryId = createRes.body.data.id;

      const emotionRes = await request(app)
        .post(`/api/v1/journal/entries/${entryId}/emotions`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ emotion: 'Fear', intensity: 3 });

      const emotionId = emotionRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/v1/journal/entries/${entryId}/emotions/${emotionId}`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf);

      expect(delRes.status).toBe(204);

      const res = await request(app)
        .get(`/api/v1/journal/entries/${entryId}/emotions`)
        .set('Cookie', user1Cookie);

      expect(res.body.data.length).toBe(0);
    });
  });
});

describe('Reviews API', () => {
  describe('POST /reviews', () => {
    it('creates a review', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          scope: 'weekly',
          periodStart: '2026-02-02',
          periodEnd: '2026-02-08',
          title: 'Week 5 Review',
          body: 'Good week',
          rating: 4,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    it('rejects duplicate period', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          scope: 'weekly',
          periodStart: '2026-02-02',
          periodEnd: '2026-02-08',
          title: 'Duplicate',
          body: 'Duplicate period',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /reviews', () => {
    it('lists reviews with filters', async () => {
      const res = await request(app)
        .get('/api/v1/reviews?scope=weekly')
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns only user\'s reviews', async () => {
      await request(app)
        .post('/api/v1/reviews')
        .set('Cookie', user2Cookie)
        .set('X-CSRF-Token', user2Csrf)
        .send({
          scope: 'monthly',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          title: 'User 2 Monthly',
          body: 'Private',
        });

      const res1 = await request(app)
        .get('/api/v1/reviews')
        .set('Cookie', user1Cookie);

      const res2 = await request(app)
        .get('/api/v1/reviews')
        .set('Cookie', user2Cookie);

      expect(res1.body.data.every((r: any) => r.userId === user1.id)).toBe(true);
      expect(res2.body.data.every((r: any) => r.userId === user2.id)).toBe(true);
    });
  });

  describe('PATCH /reviews/:id', () => {
    it('updates review', async () => {
      const createRes = await request(app)
        .post('/api/v1/reviews')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          scope: 'daily',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-01',
          title: 'Original',
          body: 'Original',
          rating: 3,
        });

      const reviewId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({ rating: 5, body: 'Updated' });

      expect(res.status).toBe(204);

      const listRes = await request(app)
        .get('/api/v1/reviews')
        .set('Cookie', user1Cookie);

      const updated = listRes.body.data.find((r: any) => r.id === reviewId);
      expect(updated.rating).toBe(5);
    });
  });

  describe('DELETE /reviews/:id', () => {
    it('deletes review', async () => {
      const createRes = await request(app)
        .post('/api/v1/reviews')
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf)
        .send({
          scope: 'monthly',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
          title: 'To Delete',
          body: 'Delete me',
        });

      const reviewId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/v1/reviews/${reviewId}`)
        .set('Cookie', user1Cookie)
        .set('X-CSRF-Token', user1Csrf);

      expect(res.status).toBe(204);

      const listRes = await request(app)
        .get('/api/v1/reviews')
        .set('Cookie', user1Cookie);

      expect(listRes.body.data.find((r: any) => r.id === reviewId)).toBeUndefined();
    });
  });
});