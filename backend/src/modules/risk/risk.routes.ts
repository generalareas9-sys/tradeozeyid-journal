import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { strictBody } from '../../middleware/validate.js';
import { noStore } from '../../lib/cookies.js';
import * as service from './risk.service.js';
import {
  riskCalculateSchema,
  riskPresetSchema,
  patchRiskPresetSchema,
} from './risk.schema.js';

/**
 * `/risk` routes (api-spec.md §9.9).
 */
const router = Router();

function sendData(res: Response, status: number, data: unknown): void {
  noStore(res);
  res.status(status).json({ data, meta: { requestId: res.req.requestId } });
}

/**
 * POST /risk/calculate
 * Stateless risk calculation. Preserves GoldRisk logic.
 */
router.post('/calculate', authMiddleware, strictBody(riskCalculateSchema), (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .calculateRisk(authReq.user.id, req.body)
    .then((result) => sendData(res, 200, result))
    .catch(next);
});

/**
 * GET /risk/presets
 * Lists user's risk presets.
 */
router.get('/presets', authMiddleware, (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .listPresets(authReq.user.id)
    .then((presets) => sendData(res, 200, presets))
    .catch(next);
});

/**
 * POST /risk/presets
 * Creates a risk preset.
 */
router.post('/presets', authMiddleware, strictBody(riskPresetSchema), (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .createPreset(authReq.user.id, req.body)
    .then((preset) => sendData(res, 201, preset))
    .catch(next);
});

/**
 * GET /risk/presets/:id
 * Gets a risk preset by ID.
 */
router.get('/presets/:id', authMiddleware, (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .getPreset(authReq.user.id, req.params.id)
    .then((preset) => sendData(res, 200, preset))
    .catch(next);
});

/**
 * PATCH /risk/presets/:id
 * Updates a risk preset.
 */
router.patch('/presets/:id', authMiddleware, strictBody(patchRiskPresetSchema), (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .updatePreset(authReq.user.id, req.params.id, req.body)
    .then((preset) => sendData(res, 200, preset))
    .catch(next);
});

/**
 * DELETE /risk/presets/:id
 * Deletes a risk preset.
 */
router.delete('/presets/:id', authMiddleware, (req, res, next) => {
  const authReq = req as AuthenticatedRequest;

  void service
    .deletePreset(authReq.user.id, req.params.id)
    .then(() => {
      noStore(res);
      res.status(204).end();
    })
    .catch(next);
});

export default router;