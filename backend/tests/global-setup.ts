import { migrateToLatest, resetToEmpty } from '../src/db/migrations/runner.js';
import { getDb, closeDb } from '../src/db/index.js';

/**
 * Global test setup - runs once before all tests.
 * Ensures the test database has all migrations applied.
 */
export default async function globalSetup(): Promise<void> {
  console.log('Global test setup: resetting and migrating test database...');
  
  const db = getDb();
  await resetToEmpty(db);
  await migrateToLatest(db);
  
  console.log('Test database ready with all migrations applied');
  
  // Close the connection - tests will create their own
  await closeDb();
}