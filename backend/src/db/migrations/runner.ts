import { sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../schema/index.js';
import { migrations, findMigration } from './index.js';
import type { Migration } from './types.js';

export const MIGRATIONS_TABLE = 'schema_migrations';

type Database = PostgresJsDatabase<typeof schema>;

/**
 * `__drizzle_migrations` is the table name used by Drizzle's own migrator.
 * database-schema.md §8 allows "or equivalent", and the runner needs a `name`
 * column so a rollback can identify the exact migration to revert.
 */
const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

async function ensureMigrationsTable(db: Database): Promise<void> {
  const existing = await db.execute<{ present: string | null }>(
    sql`SELECT to_regclass('public.schema_migrations') AS present`,
  );

  if (existing[0]?.present) return;

  await db.execute(sql.raw(CREATE_MIGRATIONS_TABLE));
}

async function readApplied(db: Database): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(
    sql`SELECT name FROM schema_migrations ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

function insertRecord(name: string): SQL {
  return sql`INSERT INTO schema_migrations (name) VALUES (${name})`;
}

function deleteRecord(name: string): SQL {
  return sql`DELETE FROM schema_migrations WHERE name = ${name}`;
}

/**
 * Applies every migration that is not yet recorded, in canonical order, each in
 * its own transaction. Returns the names that were applied by this run.
 */
export async function migrateToLatest(db: Database): Promise<string[]> {
  await ensureMigrationsTable(db);
  const applied = new Set(await readApplied(db));
  const executed: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.execute(insertRecord(migration.name));
    });

    executed.push(migration.name);
  }

  return executed;
}

/** Reverts exactly one migration: the most recently applied one. */
export async function rollbackLastMigration(db: Database): Promise<Migration | null> {
  await ensureMigrationsTable(db);
  const applied = await readApplied(db);
  const lastName = applied.at(-1);

  if (!lastName) return null;

  const migration = findMigration(lastName);
  if (!migration) {
    throw new Error(
      `Cannot roll back "${lastName}": no migration module with that name exists in this repository.`,
    );
  }

  await db.transaction(async (tx) => {
    await migration.down(tx);
    await tx.execute(deleteRecord(migration.name));
  });

  return migration;
}

/**
 * Runs every `down` in reverse order and removes the history table. Used by the
 * verification gate to prove migrations apply to a genuinely empty database.
 */
export async function resetToEmpty(db: Database): Promise<void> {
  await ensureMigrationsTable(db);
  const applied = await readApplied(db);
  const known = new Set(migrations.map((migration) => migration.name));

  for (const name of [...applied].reverse()) {
    if (!known.has(name)) continue;
    const migration = findMigration(name);
    if (!migration) continue;
    await migration.down(db);
  }

  await db.execute(sql`DROP TABLE IF EXISTS schema_migrations`);
}