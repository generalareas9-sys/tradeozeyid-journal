import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  AppError,
  ValidationError,
  isAppError,
  InternalError,
  UnauthenticatedError,
  TokenExpiredError,
  NotFoundError,
  RateLimitedError,
} from '../lib/errors.js';
import { getLogger } from '../lib/logger.js';

export function errorMiddleware(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId || 'unknown';
  const logger = getLogger();

  if (err instanceof AppError) {
    logger.warn({
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    }, 'Application error');
  } else {
    logger.error({
      requestId,
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    }, 'Unhandled error');
  }

  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    const validationError = new ValidationError(details);
    sendErrorResponse(res, validationError, requestId);
    return;
  }

  if (isAppError(err)) {
    sendErrorResponse(res, err, requestId);
    return;
  }

  if (err.name === 'UnauthorizedError' || err.message.includes('jwt')) {
    const authError = new UnauthenticatedError();
    sendErrorResponse(res, authError, requestId);
    return;
  }

  if (err.name === 'TokenExpiredError') {
    const tokenError = new TokenExpiredError();
    sendErrorResponse(res, tokenError, requestId);
    return;
  }

  const internalError = new InternalError();
  sendErrorResponse(res, internalError, requestId);
}

function sendErrorResponse(res: Response, error: AppError, requestId: string): void {
  const response: Record<string, unknown> = {
    error: {
      code: error.code,
      message: error.message,
    },
    meta: {
      requestId,
    },
  };

  if (error.details) {
    (response.error as Record<string, unknown>).details = error.details;
  }

  if (error instanceof RateLimitedError && error.retryAfter) {
    res.setHeader('Retry-After', String(error.retryAfter));
  }

  res.status(error.statusCode).json(response);
}

export function notFoundMiddleware(req: Request, res: Response): void {
  const requestId = req.requestId || 'unknown';
  const error = new NotFoundError();
  res.status(404).json({
    error: {
      code: error.code,
      message: error.message,
    },
    meta: { requestId },
  });
}