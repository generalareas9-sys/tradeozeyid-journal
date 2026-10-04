import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import {
  csrfRateLimiter,
  forgotPasswordRateLimiter,
  loginAccountRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  resetPasswordRateLimiter,
} from '../../middleware/rateLimit.js';
import { strictBody } from '../../middleware/validate.js';
import { clearSessionCookies, noStore } from '../../lib/cookies.js';
import { TokenReuseDetectedError } from '../../lib/errors.js';
import * as service from './auth.service.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schema.js';

/**
 * `/auth` routes (api-spec.md §9.2).
 *
 * Handlers stay thin: they validate, delegate to the service and write the
 * documented envelope. No business logic lives here.
 */
const router = Router();

/** Every authenticated response is `no-store` (api-spec.md §1, §7.10). */
function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

router.post('/register', registerRateLimiter, strictBody(registerSchema), (req, res, next) => {
  void service
    .register(req.body, res, req)
    .then((user) => sendData(res, 201, user))
    .catch(next);
});

/**
 * Login carries two limiters because engineering-contract.md §7.9 requires both
 * a per-IP and a per-account dimension.
 */
router.post(
  '/login',
  loginRateLimiter,
  loginAccountRateLimiter,
  strictBody(loginSchema),
  (req, res, next) => {
    void service
      .login(req.body, res, req)
      .then((user) => sendData(res, 200, user))
      .catch(next);
  },
);

router.post('/refresh', (req, res, next) => {
  void service
    .rotateSession(service.readRefreshCookie(req), req)
    .then((outcome) => {
      if (!outcome.ok) {
        if (outcome.reason === 'reuse_detected') {
          // The family is already revoked; clear the caller's cookies too.
          clearSessionCookies(res);
          throw new TokenReuseDetectedError();
        }

        clearSessionCookies(res);
        res.status(401).json({
          error: { code: 'UNAUTHENTICATED', message: 'No valid refresh token' },
          meta: { requestId: req.requestId },
        });
        return;
      }

      service.applySession(res, outcome.session);
      sendData(res, 200, { ok: true });
    })
    .catch(next);
});

router.post('/logout', (req, res, next) => {
  void service
    .logout(service.readRefreshCookie(req), req)
    .then(() => {
      clearSessionCookies(res);
      // 204, idempotent (api-spec.md §9.2).
      noStore(res);
      res.status(204).end();
    })
    .catch(next);
});

router.post('/logout-all', authMiddleware, (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .logoutAll(authReq.user.id, req)
    .then(() => {
      clearSessionCookies(res);
      noStore(res);
      res.status(204).end();
    })
    .catch(next);
});

/**
 * The CSRF bootstrap (api-spec.md §2.2.1).
 *
 * Unauthenticated by design: the token grants no authority and the response
 * carries no user data. `GET`, so §2.2 does not guard it, which is precisely why
 * it has to exist — every endpoint that would otherwise set `csrf_token` is
 * itself a guarded unsafe method.
 */
router.get('/csrf', csrfRateLimiter, (_req, res) => {
  const csrfToken = service.issueCsrfToken(res);

  sendData(res, 200, { csrfToken });
});

router.get('/me', authMiddleware, (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .findUserForRequest(authReq.user.id)
    .then((user) => sendData(res, 200, user))
    .catch(next);
});

router.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  strictBody(forgotPasswordSchema),
  (req, res, next) => {
    void service
      .requestPasswordReset(req.body, req)
      .then((message) => {
        noStore(res);
        // Always 202, whether or not the account exists.
        res.status(202).json({ data: { message }, meta: { requestId: req.requestId } });
      })
      .catch(next);
  },
);

router.post(
  '/reset-password',
  resetPasswordRateLimiter,
  strictBody(resetPasswordSchema),
  (req, res, next) => {
    void service
      .resetPassword(req.body, req)
      .then(() => {
        clearSessionCookies(res);
        noStore(res);
        res.status(204).end();
      })
      .catch(next);
  },
);

router.post(
  '/change-password',
  authMiddleware,
  strictBody(changePasswordSchema),
  (req, res, next) => {
    const authReq = req as AuthenticatedRequest;

    void service
      .changePassword(authReq.user.id, req.body, req)
      .then(() => {
        noStore(res);
        res.status(204).end();
      })
      .catch(next);
  },
);

export default router;