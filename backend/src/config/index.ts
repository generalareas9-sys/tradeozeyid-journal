import { z } from 'zod';
import { loadRepositoryEnvFile } from './loadEnvFile.js';

loadRepositoryEnvFile();

// `z.coerce.boolean()` turns the string "false" into `true`, so booleans are
// parsed explicitly from the accepted literals instead.
const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_TEST: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  // engineering-contract.md §7.2: secure defaults to true; development relaxes
  // it explicitly through COOKIE_SECURE=false in `.env`.
  COOKIE_SECURE: booleanFromEnv.default('true'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STORAGE_DIR: z.string().default('./backend/storage'),
  ALLOW_TEST_BEARER: booleanFromEnv.default('false'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([key, msgs]) => `${key}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  cachedEnv = parsed.data;

  // Test environment protection
  if (cachedEnv.NODE_ENV === 'test' && !cachedEnv.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is required when NODE_ENV=test');
  }

  if (cachedEnv.NODE_ENV !== 'test' && cachedEnv.DATABASE_URL_TEST) {
    console.warn('DATABASE_URL_TEST is set but NODE_ENV is not test. This may be intentional for local testing.');
  }

  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

/**
 * Resolves the connection string for the current environment. In `test` the
 * dedicated test database is always used; `DATABASE_URL_TEST` is never optional
 * there (engineering-contract.md §2).
 */
export function getDatabaseUrl(): string {
  const env = getEnv();

  if (env.NODE_ENV === 'test') {
    if (!env.DATABASE_URL_TEST) {
      throw new Error('DATABASE_URL_TEST is required when NODE_ENV=test');
    }
    return env.DATABASE_URL_TEST;
  }

  return env.DATABASE_URL;
}