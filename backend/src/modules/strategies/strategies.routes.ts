import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import * as service from './strategies.service.js';
import {
  createStrategySchema,
  patchStrategySchema,
  listStrategiesQuerySchema,
  createRuleSchema,
  patchRuleSchema,
  reorderRulesSchema,
  listRulesQuerySchema,
  patchRuleParamSchema,
} from './strategies.schema.js';

/**
 * `/strategies` routes (api-spec.md §9.5).
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
 * GET /strategies
 *
 * Query: `status`, `q`, `limit`, `offset`, `sort`, `order`.
 * 200 → collection of strategies with rules and tradeCount.
 */
router.get('/', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listStrategiesQuerySchema.parse(req.query);

  void service
    .listStrategies(authReq.user.id, query)
    .then((strategies) => sendData(res, 200, strategies))
    .catch(next);
});

/**
 * POST /strategies
 *
 * Body: `{ name, description?, category?, color?, status? }`.
 * 201 → strategy with empty rules and tradeCount 0. Duplicate name → 409 CONFLICT.
 */
router.post('/', strictBody(createStrategySchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createStrategy(authReq.user.id, req.body, authReq)
    .then((result) => sendData(res, 201, result))
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
 * GET /strategies/:id
 *
 * 200 → strategy with rules and tradeCount.
 * 404 if not owned by user.
 */
router.get('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .getStrategy(authReq.user.id, req.params.id)
    .then((strategy) => sendData(res, 200, strategy))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});
 
 /**
  * GET /strategies/:id/stats
  *
  * 200 → strategy statistics (netPnl, winRate, profitFactor, averageR).
  * 404 if not owned by user.
  */
router.get('/:id/stats', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
 
  void service
    .getStrategyStats(authReq.user.id, req.params.id)
    .then((stats) => sendData(res, 200, stats))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});
 
/**
 * PATCH /strategies/:id
 */
router.patch('/:id', strictBody(patchStrategySchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateStrategy(authReq.user.id, req.params.id, req.body, authReq)
    .then((strategy) => sendData(res, 200, strategy))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
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
 * DELETE /strategies/:id
 *
 * Soft delete (archive). 204.
 */
router.delete('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .archiveStrategy(authReq.user.id, req.params.id, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * GET /strategies/:id/rules
 *
 * 200 → ordered list of rules.
 */
router.get('/:id/rules', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listRulesQuerySchema.parse(req.query);

  void service
    .listRules(authReq.user.id, req.params.id, { limit: query.limit, offset: query.offset })
    .then((rules) => sendData(res, 200, rules))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * POST /strategies/:id/rules
 *
 * Body: `{ text, isRequired? }`. Position assigned as next integer.
 * 201 → rule.
 */
router.post('/:id/rules', strictBody(createRuleSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createRule(authReq.user.id, req.params.id, req.body, authReq)
    .then((rule) => sendData(res, 201, rule))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
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
 * PATCH /strategies/:id/rules/:ruleId
 *
 * Accepts `text`, `isRequired`.
 */
router.patch('/:id/rules/:ruleId', strictBody(patchRuleSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateRule(authReq.user.id, req.params.id, req.params.ruleId, req.body, authReq)
    .then((rule) => sendData(res, 200, rule))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy or rule not found' },
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
 * PUT /strategies/:id/rules/order
 *
 * Body: `{ ruleIds: string[] }`. Rewrites positions gaplessly in one transaction.
 * 204.
 */
router.put('/:id/rules/order', strictBody(reorderRulesSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .reorderRules(authReq.user.id, req.params.id, req.body.ruleIds, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
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
 * DELETE /strategies/:id
 *
 * Archive (soft delete). 204.
 */
router.delete('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .archiveStrategy(authReq.user.id, req.params.id, authReq)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

export default router;