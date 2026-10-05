import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import * as service from './journal.service.js';
import {
  createJournalEntrySchema,
  patchJournalEntrySchema,
  listJournalEntriesQuerySchema,
  createJournalEmotionSchema,
  createReviewSchema,
  patchReviewSchema,
  listReviewsQuerySchema,
} from './journal.schema.js';

/**
 * `/journal` routes (api-spec.md §9.10).
 */
const router = Router();

router.use(authMiddleware);

/** Every authenticated response is `no-store` (api-spec.md §1, §7.10). */
function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

/**
 * GET /journal/entries
 */
router.get('/entries', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listJournalEntriesQuerySchema.parse(req.query);

  void service
    .listJournalEntries(authReq.user.id, query)
    .then((result) => sendData(res, 200, result))
    .catch(next);
});

/**
 * POST /journal/entries
 */
router.post('/entries', strictBody(createJournalEntrySchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createJournalEntry(authReq.user.id, req.body, authReq)
    .then((result) => sendData(res, 201, result))
    .catch((error) => {
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.details },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: error.message },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ConflictError) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: error.message },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * GET /journal/entries/:id
 */
router.get('/entries/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .getJournalEntry(authReq.user.id, req.params.id)
    .then((entry) => sendData(res, 200, entry))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Journal entry not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * PATCH /journal/entries/:id
 */
router.patch('/entries/:id', strictBody(patchJournalEntrySchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateJournalEntry(authReq.user.id, req.params.id, req.body, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Journal entry not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ConflictError) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: error.message },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.details },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * DELETE /journal/entries/:id
 */
router.delete('/entries/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .deleteJournalEntry(authReq.user.id, req.params.id)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Journal entry not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * GET /journal/entries/:id/emotions
 */
router.get('/entries/:id/emotions', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .listJournalEmotions(authReq.user.id, req.params.id)
    .then((emotions) => sendData(res, 200, emotions))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Journal entry not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * POST /journal/entries/:id/emotions
 */
router.post('/entries/:id/emotions', strictBody(createJournalEmotionSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createJournalEmotion(authReq.user.id, req.params.id, req.body, authReq)
    .then((result) => sendData(res, 201, result))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Journal entry not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.details },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * DELETE /journal/entries/:id/emotions/:emotionId
 * Note: PATCH is not in the API spec for emotions, only POST and DELETE
 */
router.delete('/entries/:id/emotions/:emotionId', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .deleteJournalEmotion(authReq.user.id, req.params.id, req.params.emotionId)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Journal emotion not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * GET /reviews
 */
router.get('/reviews', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listReviewsQuerySchema.parse(req.query);

  void service
    .listReviews(authReq.user.id, query)
    .then((result) => sendData(res, 200, result))
    .catch(next);
});

/**
 * POST /reviews
 */
router.post('/reviews', strictBody(createReviewSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createReview(authReq.user.id, req.body, authReq)
    .then((result) => sendData(res, 201, result))
    .catch((error) => {
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.details },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ConflictError) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: error.message },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * PATCH /reviews/:id
 */
router.patch('/reviews/:id', strictBody(patchReviewSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateReview(authReq.user.id, req.params.id, req.body, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Review not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ConflictError) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: error.message },
          meta: { requestId: req.requestId },
        });
        return;
      }
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.details },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * DELETE /reviews/:id
 */
router.delete('/reviews/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .deleteReview(authReq.user.id, req.params.id)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Review not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

export default router;