import { Router } from 'express';
import type { Response } from 'express';
import type { ApiResponse, UserResource } from '@tradeozeyid/contracts';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import { NotFoundError } from '../../lib/errors.js';
import { patchUserSchema } from '../auth/auth.schema.js';
import * as repo from '../auth/auth.repository.js';
import { toUserResource } from '../auth/auth.service.js';
import { writeAudit } from '../audit/audit.service.js';
import type { Request } from 'express';

/**
 * `/users/me` (api-spec.md §9.2).
 *
 * The target is always the caller. There is no user-id parameter, so a
 * cross-user read is not expressible; `GET /users/:id` does not exist.
 */
const router = Router();

router.use(authMiddleware);

function send(res: Response, status: number, data: UserResource, notices?: string[]): void {
  noStore(res);

  const body: ApiResponse<UserResource> = {
    data,
    meta: { requestId: res.req.requestId },
  };

  if (notices && notices.length > 0) {
    body.meta.notices = notices;
  }

  res.status(status).json(body);
}

router.get('/me', (req: Request, res: Response, next) => {
  const authReq = req as AuthenticatedRequest;

  void repo
    .findUserById(authReq.user.id)
    .then((user) => {
      if (!user) {
        throw new NotFoundError('User not found');
      }
      send(res, 200, toUserResource(user));
    })
    .catch(next);
});

/**
 * `PATCH /users/me` accepts only `displayName`, `timezone`, `locale`,
 * `baseCurrency` and `defaultRiskPercent`. Email and password are **not**
 * patchable here (api-spec.md §9.2) — `strict()` in the schema rejects them.
 *
 * Changing `timezone` does not rewrite existing trades; it changes future
 * day/week/month analytics grouping, so the response says so in
 * `meta.notices` (api-spec.md §9.2).
 */
router.patch('/me', strictBody(patchUserSchema), (req: Request, res: Response, next) => {
  const authReq = req as AuthenticatedRequest;
  const patch = req.body as Record<string, unknown>;
  const notices: string[] = [];

  if (patch.timezone !== undefined) {
    notices.push(
      'Changing your timezone does not rewrite existing trades. It changes how future day, week and month analytics are grouped.',
    );
  }

  void repo
    .patchUser(authReq.user.id, patch)
    .then(async (user) => {
      if (!user) {
        throw new NotFoundError('User not found');
      }

      await writeAudit({
        actorUserId: user.id,
        action: 'user.update',
        entityType: 'user',
        entityId: user.id,
        // Field names only. No values that could carry a secret.
        metadata: { fields: Object.keys(patch).sort() },
        req,
      });

      send(res, 200, toUserResource(user), notices);
    })
    .catch(next);
});

export default router;