import pino, { type Logger } from 'pino';
import { getEnv } from '../config/index.js';

let cachedLogger: Logger | null = null;

function createLogger(): Logger {
  const env = getEnv();

  return pino({
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    redact: {
      paths: [
        'password',
        'passwordHash',
        'token',
        'tokenHash',
        'accessToken',
        'refreshToken',
        'cookie',
        'cookies',
        'authorization',
        'set-cookie',
        '*.password',
        '*.token',
        '*.secret',
        '*.key',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

/**
 * The process-wide structured logger. Created on first use so that importing a
 * module that logs never forces environment validation at import time.
 */
export function getLogger(): Logger {
  if (!cachedLogger) {
    cachedLogger = createLogger();
  }
  return cachedLogger;
}

export function resetLogger(): void {
  cachedLogger = null;
}