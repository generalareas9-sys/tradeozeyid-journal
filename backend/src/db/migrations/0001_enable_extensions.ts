import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP EXTENSION IF EXISTS citext`);
}