export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Array<{ path: string; message: string }>;

  constructor(code: string, message: string, statusCode: number, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(details: Array<{ path: string; message: string }>) {
    super('VALIDATION_ERROR', 'Request validation failed', 400, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Missing or invalid access token') {
    super('UNAUTHENTICATED', message, 401);
  }
}

/**
 * Login failure (api-spec.md §5). The message is deliberately vague: it must
 * not reveal whether the email exists, so it is identical for "no such account"
 * and "wrong password".
 */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super('TOKEN_EXPIRED', 'Access token expired', 401);
  }
}

export class TokenReuseDetectedError extends AppError {
  constructor() {
    super('TOKEN_REUSE_DETECTED', 'Refresh token reuse detected', 401);
  }
}

export class CsrfFailedError extends AppError {
  constructor() {
    super('CSRF_FAILED', 'CSRF token missing or invalid', 403);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Action not permitted') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super('CONFLICT', message, 409);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor() {
    super('PAYLOAD_TOO_LARGE', 'Request payload too large', 413);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super('UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', 415);
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfter?: number) {
    super('RATE_LIMITED', 'Rate limit exceeded', 429);
    this.retryAfter = retryAfter;
  }
  public readonly retryAfter?: number;
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL_ERROR', message, 500);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}