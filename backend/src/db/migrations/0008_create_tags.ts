import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE tags (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name text NOT NULL,
      color char(7),
      category tag_category NOT NULL DEFAULT 'custom',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_tags_id_user UNIQUE (id, user_id),
      CONSTRAINT ck_tags_name CHECK (char_length(name) BETWEEN 1 AND 40),
      CONSTRAINT ck_tags_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
    );
    CREATE UNIQUE INDEX uq_tags_name ON tags (user_id, lower(name)) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tags_user ON tags (user_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tags_category ON tags (user_id, category) WHERE deleted_at IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS tags`);
}