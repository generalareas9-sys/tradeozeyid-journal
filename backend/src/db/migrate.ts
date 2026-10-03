import { getDb, closeDb } from './index.js';
import { getEnv } from '../config/index.js';
import { migrateToLatest } from './migrations/runner.js';

/**
 * `npm run db:migrate`. Applies every pending migration from the canonical
 * sequence in one pass, which is how the verification gate proves the full
 * sequence applies cleanly to an empty database.
 */
async function main(): Promise<void> {
  const env = getEnv();
  const db = getDb();

  try {
    const applied = await migrateToLatest(db);

    if (applied.length === 0) {
      console.log(`No pending migrations for NODE_ENV=${env.NODE_ENV}.`);
      return;
    }

    for (const name of applied) {
      console.log(`applied ${name}`);
    }
    console.log(`${applied.length} migration(s) applied.`);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});