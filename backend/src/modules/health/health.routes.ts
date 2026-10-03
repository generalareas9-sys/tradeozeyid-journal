import { Router } from 'express';
import { checkHealth } from './health.service.js';

const router = Router();

router.get('/health', (req, res) => {
  void checkHealth(req.requestId).then((result) => {
    res.status(result.httpStatus).json(result.body);
  });
});

export default router;