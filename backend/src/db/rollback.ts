import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '../config/index.js';
import * as schema from './schema/index.js';
import { rollbackLastMigration } from './migrations/runner.js';

/**
 * `npm run db:rollback` (database-schema.md §8, "Rollback behavior").
 *
 * Safety rules, both mandatory:
 *  1. Refuses to run when NODE_ENV=production.
 *  2. Connects to `DATABASE_URL_TEST` and nothing else, so a rollback can never
 *     reach the development or production database.
 */
async function main(): Promise<void> {
  const env = getEnv();

  if (env.NODE_ENV === 'production') {
    console.error('Rollback refused: NODE_ENV=production.');
    process.exit(1);
  }

  if (!env.DATABASE_URL_TEST) {
    console.error('Rollback refused: DATABASE_URL_TEST is not set.');
    process.exit(1);
  }

  const target = env.DATABASE_URL_TEST;
  const client = postgres(target, { max: 1, connect_timeout: 10 });
  const db = drizzle(client, { schema });

  try {
    const migration = await rollbackLastMigration(db);

    if (!migration) {
      console.log('No applied migrations found in DATABASE_URL_TEST; nothing to roll back.');
      return;
    }

    console.log(`rolled back ${migration.name}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Rollback failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});