import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { getEnv } from './config/index.js';
import { getLogger } from './lib/logger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { globalRateLimiter } from './middleware/rateLimit.js';
import healthRoutes from './modules/health/health.routes.js';

interface AppOptions {
  authMode?: 'cookie' | 'bearer';
}

export function createApp(options: AppOptions = {}): express.Express {
  const env = getEnv();

  // Fail-closed guard (api-spec.md §2.4): the bearer path exists only for
  // automated tests. A production listener can never be built through it.
  if (options.authMode === 'bearer') {
    if (env.NODE_ENV !== 'test') {
      throw new Error('authMode "bearer" is only available when NODE_ENV=test.');
    }
    if (!env.ALLOW_TEST_BEARER) {
      throw new Error('authMode "bearer" requires ALLOW_TEST_BEARER=true.');
    }
  }

  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const corsOrigins = env.CORS_ORIGINS.split(',').map((o: string) => o.trim());
  const corsOptions = {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  };
  app.use(cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(cookieParser());

  app.use(requestIdMiddleware);

  app.use(globalRateLimiter);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      getLogger().info({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      }, 'HTTP request');
    });
    next();
  });

  const apiRouter = express.Router();

  apiRouter.use(healthRoutes);

  apiRouter.use(csrfMiddleware);

  app.use('/api/v1', apiRouter);

  app.use(notFoundMiddleware);

  app.use(errorMiddleware);

  return app;
}