import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/index.js';
import { migrations } from '../../src/db/migrations/index.js';
import {
  migrateToLatest,
  resetToEmpty,
  rollbackLastMigration,
} from '../../src/db/migrations/runner.js';

const CANONICAL_SEQUENCE = [
  '0001_enable_extensions',
  '0002_create_enums',
  '0003_create_users',
  '0004_create_auth_tokens',
  '0005_create_audit_log',
  '0006_create_accounts',
  '0007_create_strategies',
  '0008_create_tags',
  '0009_create_trades',
  '0010_create_trade_children',
  '0011_create_instrument_specs',
  '0012_create_journal',
  '0013_create_trade_reviews',
];

async function listUserTables(): Promise<string[]> {
  const rows = await getDb().execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' ORDER BY tablename`,
  );
  return rows.map((row) => row.tablename);
}

async function appliedMigrations(): Promise<string[]> {
  const rows = await getDb().execute<{ name: string }>(
    sql`SELECT name FROM schema_migrations ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

beforeAll(async () => {
  await resetToEmpty(getDb());
});

afterAll(async () => {
  await closeDb();
});

describe('canonical migration sequence', () => {
  it('is exactly the sequence recorded in docs/database-schema.md §8', () => {
    expect(migrations.map((migration) => migration.name)).toEqual(CANONICAL_SEQUENCE);
  });

  it('gives every migration an up and a down', () => {
    for (const migration of migrations) {
      expect(typeof migration.up, migration.name).toBe('function');
      expect(typeof migration.down, migration.name).toBe('function');
    }
  });
});

describe('migration runner against an empty database', () => {
  it('starts from a database with no application objects', async () => {
    expect(await listUserTables()).toEqual([]);
  });

  it('applies all 13 migrations in one pass', async () => {
    const applied = await migrateToLatest(getDb());

    expect(applied).toEqual(CANONICAL_SEQUENCE);
    expect(await appliedMigrations()).toEqual(CANONICAL_SEQUENCE);
  });

  it('creates every table the schema declares', async () => {
    expect(await listUserTables()).toEqual([
      'audit_log',
      'instrument_specs',
      'journal_emotions',
      'journal_entries',
      'password_reset_tokens',
      'refresh_tokens',
      'reviews',
      'strategies',
      'strategy_rules',
      'tags',
      'trade_attachments',
      'trade_executions',
      'trade_notes',
      'trade_reviews',
      'trade_tags',
      'trades',
      'trading_accounts',
      'users',
    ]);
  });

  it('creates every enum type and enables citext', async () => {
    const enums = await getDb().execute<{ typname: string }>(
      sql`SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname`,
    );
    expect(enums.map((row) => row.typname)).toEqual([
      'account_status',
      'account_type',
      'attachment_kind',
      'execution_side',
      'journal_scope',
      'market_session',
      'strategy_status',
      'tag_category',
      'token_revoked_reason',
      'trade_direction',
      'trade_status',
      'user_status',
    ]);

    const extensions = await getDb().execute<{ extname: string }>(
      sql`SELECT extname FROM pg_extension WHERE extname = 'citext'`,
    );
    expect(extensions).toHaveLength(1);
  });

  it('creates the composite ownership foreign keys, not single-column ones', async () => {
    const constraints = await getDb().execute<{ conname: string; contype: string }>(
      sql`SELECT conname, contype FROM pg_constraint WHERE conname LIKE 'fk_%' ORDER BY conname`,
    );
    const names = constraints.map((row) => row.conname);

    expect(names).toContain('fk_trades_account');
    expect(names).toContain('fk_trades_strategy');
    expect(names).toContain('fk_trade_tags_trade');
    expect(names).toContain('fk_trade_tags_tag');
    expect(names).toContain('fk_trade_executions_trade');
    expect(names).toContain('fk_trade_notes_trade');
    expect(names).toContain('fk_trade_attachments_trade');
    expect(names).toContain('fk_trade_reviews_trade');
    expect(names).toContain('fk_journal_emotions_entry');
    expect(names).toContain('fk_journal_entries_account');
  });

  it('leaves no database default on an application id column', async () => {
    const defaults = await getDb().execute<{ table_name: string; column_default: string | null }>(
      sql`SELECT table_name, column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'id' AND column_default IS NOT NULL`,
    );

    expect(defaults).toEqual([]);
  });

  it('is idempotent when run again', async () => {
    expect(await migrateToLatest(getDb())).toEqual([]);
    expect(await appliedMigrations()).toHaveLength(CANONICAL_SEQUENCE.length);
  });

  it('rolls back exactly one migration and leaves the rest intact', async () => {
    const rolledBack = await rollbackLastMigration(getDb());

    expect(rolledBack?.name).toBe('0013_create_trade_reviews');
    expect(await appliedMigrations()).toHaveLength(CANONICAL_SEQUENCE.length - 1);
    expect(await listUserTables()).not.toContain('trade_reviews');
    expect(await listUserTables()).toContain('trades');
  });

  it('can be rolled back all the way down and re-applied to the full sequence', async () => {
    let rolledBack = 0;
    while ((await rollbackLastMigration(getDb())) !== null) {
      rolledBack += 1;
      expect(rolledBack, 'rollback made no progress').toBeLessThanOrEqual(CANONICAL_SEQUENCE.length);
    }

    expect(rolledBack).toBe(CANONICAL_SEQUENCE.length - 1);
    expect(await listUserTables()).toEqual([]);

    expect(await migrateToLatest(getDb())).toEqual(CANONICAL_SEQUENCE);
    expect(await listUserTables()).toContain('trade_reviews');
    expect(await listUserTables()).toContain('users');
  });
});