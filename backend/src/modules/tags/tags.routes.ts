import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import * as service from './tags.service.js';
import {
  createTagSchema,
  patchTagSchema,
  listTagsQuerySchema,
} from './tags.schema.js';

/**
 * `/tags` routes (api-spec.md §9.6).
 *
 * Handlers stay thin: they validate, delegate to the service and write the
 * documented envelope. No business logic lives here.
 */
const router = Router();

router.use(authMiddleware);

/** Every authenticated response is `no-store` (api-spec.md §1, §7.10). */
function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

/**
 * GET /tags
 *
 * Query: `category`, `q`, `withCounts`, `limit`, `offset`, `sort`, `order`.
 * 200 → collection of tags with optional `tradeCount`.
 */
router.get('/', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listTagsQuerySchema.parse(req.query);

  void service
    .listTags(authReq.user.id, query)
    .then((tags) => sendData(res, 200, tags))
    .catch(next);
});

/**
 * POST /tags
 *
 * Body: `{ name, color?, category? }`.
 * 201 → tag. Duplicate name → 409 CONFLICT.
 */
router.post('/', strictBody(createTagSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createTag(authReq.user.id, req.body, authReq)
    .then((tag) => sendData(res, 201, tag))
    .catch((error) => {
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
 * GET /tags/:id
 *
 * 200 → tag.
 * 404 if not owned by user.
 */
router.get('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .getTag(authReq.user.id, req.params.id)
    .then((tag) => sendData(res, 200, tag))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Tag not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * PATCH /tags/:id
 *
 * Accepts `name`, `color`, `category`. Duplicate name → 409 CONFLICT.
 */
router.patch('/:id', strictBody(patchTagSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateTag(authReq.user.id, req.params.id, req.body, authReq)
    .then((tag) => sendData(res, 200, tag))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Tag not found' },
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
 * DELETE /tags/:id
 *
 * Soft delete (archive). Also deletes `trade_tags` rows in same transaction.
 * 204.
 */
router.delete('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .archiveTag(authReq.user.id, req.params.id, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Tag not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

export default router;