import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE strategies (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      category text,
      status strategy_status NOT NULL DEFAULT 'active',
      color char(7),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_strategies_id_user UNIQUE (id, user_id),
      CONSTRAINT ck_strategies_name CHECK (char_length(name) BETWEEN 1 AND 60),
      CONSTRAINT ck_strategies_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
      CONSTRAINT ck_strategies_status CHECK (status <> 'archived' OR deleted_at IS NOT NULL)
    );
    CREATE UNIQUE INDEX uq_strategies_name ON strategies (user_id, lower(name)) WHERE deleted_at IS NULL;
    CREATE INDEX idx_strategies_user ON strategies (user_id) WHERE deleted_at IS NULL;

    CREATE TABLE strategy_rules (
      id uuid PRIMARY KEY,
      strategy_id uuid NOT NULL REFERENCES strategies (id) ON DELETE CASCADE,
      position integer NOT NULL,
      text text NOT NULL,
      is_required boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_strategy_rules_position UNIQUE (strategy_id, position),
      CONSTRAINT ck_strategy_rules_position CHECK (position >= 0),
      CONSTRAINT ck_strategy_rules_text CHECK (char_length(text) BETWEEN 1 AND 500)
    );
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS strategy_rules`);
  await db.execute(sql`DROP TABLE IF EXISTS strategies`);
}