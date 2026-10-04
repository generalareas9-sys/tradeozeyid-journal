import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import * as service from './trading-accounts.service.js';
import {
  createAccountSchema,
  patchAccountSchema,
  listAccountsQuerySchema,
} from './trading-accounts.schema.js';

/**
 * `/trading-accounts` routes (api-spec.md §9.3).
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
 * GET /trading-accounts
 *
 * Query: `includeArchived` (boolean, default false), `status` (active|archived).
 * 200 → collection of trading accounts with computed `currentBalance` and `tradeCount`.
 */
router.get('/', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const query = listAccountsQuerySchema.parse(req.query);

  void service
    .listAccounts(authReq.user.id, {
      includeArchived: query.includeArchived,
      status: query.status,
    })
    .then((accounts) => sendData(res, 200, accounts))
    .catch(next);
});

/**
 * POST /trading-accounts
 *
 * Body: name, broker, type, currency, startingBalance, timezone, defaultRiskPercent, isDefault, notes.
 * 201 → trading account. First account auto-becomes default. Duplicate name → 409 CONFLICT.
 */
router.post('/', strictBody(createAccountSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .createAccount(authReq.user.id, req.body)
    .then((account) => sendData(res, 201, account))
    .catch((error) => {
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
 * GET /trading-accounts/:id
 *
 * 200 → account plus light summary (tradeCount, firstTradeAt, lastTradeAt).
 * 404 if not owned by user.
 */
router.get('/:id', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .getAccount(authReq.user.id, req.params.id)
    .then((account) => sendData(res, 200, account))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trading account not found' },
          meta: { requestId: req.requestId },
        });
        return;
      }
      next(error);
    });
});

/**
 * PATCH /trading-accounts/:id
 *
 * Accepts the same fields as create. Changing `startingBalance` is rejected
 * once the account has closed trades (409 CONFLICT). Duplicate name → 409.
 */
router.patch('/:id', strictBody(patchAccountSchema), (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .updateAccount(authReq.user.id, req.params.id, req.body)
    .then((account) => sendData(res, 200, account))
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trading account not found' },
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
 * POST /trading-accounts/:id/archive
 *
 * 204. Soft delete (sets deleted_at, status=archived). Rejected with 409
 * CONFLICT while closed trades exist.
 */
router.post('/:id/archive', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .archiveAccount(authReq.user.id, req.params.id)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trading account not found' },
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
 * POST /trading-accounts/:id/set-default
 *
 * 204. Sets this account as the user's default. Rejected if archived (409).
 */
router.post('/:id/set-default', (req, res, next) => {
  const authReq = req as unknown as AuthenticatedRequest;

  void service
    .setDefaultAccount(authReq.user.id, req.params.id)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch((error) => {
      if (error instanceof NotFoundError) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Trading account not found' },
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

export default router;