import { sql } from 'drizzle-orm';
import { getDb } from '../../db/index.js';

/**
 * Executes a real `SELECT 1` against PostgreSQL. api-spec.md §9.1 requires the
 * health endpoint to report `database: "ok"` only when the database actually
 * answers, so nothing here is faked or inferred from configuration.
 */
export async function pingDatabase(): Promise<void> {
  await getDb().execute(sql`SELECT 1`);
}