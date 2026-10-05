import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import * as service from './trade-reviews.service.js';
import { tradeReviewSchema } from './trade-reviews.schema.js';

/**
 * `/trades/:id/review` routes (api-spec.md §9.4).
 */
const router = Router({ mergeParams: true });

router.use(authMiddleware);

/** Every authenticated response is `no-store` (api-spec.md §1, §7.10). */
function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

interface TradeReviewRequest extends AuthenticatedRequest {
  params: { id: string };
}

/**
 * GET /trades/:id/review
 *
 * 200 → review resource, or { data: null } when none exists (never 404).
 */
router.get('/', (req, res, next) => {
  const authReq = req as TradeReviewRequest;
  const tradeId = authReq.params.id;

  void service
    .getTradeReview(authReq.user.id, tradeId)
    .then((review) => sendData(res, 200, review))
    .catch(next);
});

/**
 * PUT /trades/:id/review
 *
 * Upserts the trade review. All fields optional; validates 1-5 scales.
 * 200 → review resource.
 */
router.put('/', strictBody(tradeReviewSchema), (req, res, next) => {
  const authReq = req as TradeReviewRequest;
  const tradeId = authReq.params.id;

  void service
    .upsertTradeReview(authReq.user.id, tradeId, req.body, authReq)
    .then((review) => sendData(res, 200, review))
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
          error: { code: 'NOT_FOUND', message: 'Trade not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

export default router;