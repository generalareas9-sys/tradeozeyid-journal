import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE password_reset_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_password_reset_tokens_hash UNIQUE (token_hash)
    );
    CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id, created_at DESC);

    CREATE TABLE refresh_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      family_id uuid NOT NULL,
      token_hash text NOT NULL,
      issued_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      rotated_at timestamptz,
      revoked_at timestamptz,
      revoked_reason token_revoked_reason,
      user_agent text,
      ip inet,
      CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
      CONSTRAINT ck_refresh_tokens_expiry CHECK (expires_at > issued_at)
    );
    CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, expires_at DESC);
    CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
    CREATE INDEX idx_refresh_tokens_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS refresh_tokens`);
  await db.execute(sql`DROP TABLE IF EXISTS password_reset_tokens`);
}