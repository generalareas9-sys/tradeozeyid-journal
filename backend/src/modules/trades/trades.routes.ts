import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import * as service from './trades.service.js';
import {
  createTradeSchema,
  patchTradeSchema,
  closeTradeSchema,
  reopenTradeSchema,
  cancelTradeSchema,
  listTradesQuerySchema,
  tradeTagsSchema,
} from './trades.schema.js';
import tradeReviewRoutes from './trade-reviews.routes.js';

/**
 * `/trades` routes (api-spec.md §9.4).
 */
const router = Router();

router.use(authMiddleware);

/** Every authenticated response is `no-store` (api-spec.md §1, §7.10). */
function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

/**
 * GET /trades
 *
 * Query: full filter set, cursor pagination, sorting.
 * 200 → collection of trades with meta.pagination.
 */
router.get('/', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listTradesQuerySchema.parse(req.query);

  void service
    .listTrades(authReq.user.id, query)
    .then((result) => sendData(res, 200, result))
    .catch(next);
});

/**
 * POST /trades
 *
 * Body: accountId, strategyId, symbol, broker, direction, quantity, entryPrice,
 * stopLoss, takeProfit, entryTime, status, contractSize, plannedRisk,
 * riskPercent, fees, swap, title, mistake, followedPlan, brokeRules, tagIds.
 * 201 → { id: string }. Server derives session, contractSize, plannedRisk.
 */
router.post('/', strictBody(createTradeSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createTrade(authReq.user.id, req.body, authReq)
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
 * GET /trades/:id
 *
 * 200 → full trade detail with executions, notes, attachments, review, tags.
 * 404 if not owned by user.
 */
router.get('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .getTrade(authReq.user.id, req.params.id)
    .then((trade) => sendData(res, 200, trade))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * PATCH /trades/:id
 *
 * Accepts same fields as create. Status-based restrictions:
 * - planned: everything
 * - open: everything except entryPrice, quantity, direction
 * - closed: title, mistake, followedPlan, brokeRules, tags, notes, attachments, review, fees, exitPrice
 * - cancelled: metadata only
 */
router.patch('/:id', strictBody(patchTradeSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateTrade(authReq.user.id, req.params.id, req.body, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
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
 * POST /trades/:id/close
 *
 * Body: exitPrice, exitTime, fees, note.
 * Sets status = 'closed', computes pnl and rMultiple, audits.
 * 409 CONFLICT if already closed or cancelled.
 */
router.post('/:id/close', strictBody(closeTradeSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .closeTrade(authReq.user.id, req.params.id, req.body, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
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
 * POST /trades/:id/reopen
 *
 * Body: { reason }. Only closed → open. Clears exit fields.
 * Rejected when trade has executions.
 */
router.post('/:id/reopen', strictBody(reopenTradeSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .reopenTrade(authReq.user.id, req.params.id, req.body.reason, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
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
 * POST /trades/:id/cancel
 *
 * Body: { reason }. Only planned or open → cancelled. Frees reserved risk.
 */
router.post('/:id/cancel', strictBody(cancelTradeSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .cancelTrade(authReq.user.id, req.params.id, req.body.reason, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
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
 * DELETE /trades/:id
 *
 * Soft delete. 204.
 */
router.delete('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .deleteTrade(authReq.user.id, req.params.id)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * PUT /trades/:id/tags
 *
 * Replaces the trade's tags with the provided list. All tags must exist
 * and belong to the user. 204.
 */
router.put('/:id/tags', strictBody(tradeTagsSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .setTradeTags(authReq.user.id, req.params.id, req.body.tagIds, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade or tag not found' },
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
 * DELETE /trades/:id/tags
 *
 * Removes all tags from the trade. 204.
 */
router.delete('/:id/tags', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .clearTradeTags(authReq.user.id, req.params.id, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * Trade review routes (GET/PUT /trades/:id/review)
 */
router.use('/:id/review', tradeReviewRoutes);

export default router;