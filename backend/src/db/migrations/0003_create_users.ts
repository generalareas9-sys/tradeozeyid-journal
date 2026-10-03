import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email citext NOT NULL,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      timezone text NOT NULL DEFAULT 'UTC',
      base_currency char(3) NOT NULL DEFAULT 'USD',
      locale text NOT NULL DEFAULT 'en',
      status user_status NOT NULL DEFAULT 'active',
      email_verified_at timestamptz,
      default_risk_percent numeric(6,3) NOT NULL DEFAULT 1.000,
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_users_email UNIQUE (email),
      CONSTRAINT ck_users_timezone CHECK (char_length(timezone) BETWEEN 1 AND 64),
      CONSTRAINT ck_users_display_name CHECK (char_length(display_name) BETWEEN 1 AND 80),
      CONSTRAINT ck_users_base_currency CHECK (base_currency = upper(base_currency) AND char_length(base_currency) = 3),
      CONSTRAINT ck_users_default_risk CHECK (default_risk_percent > 0 AND default_risk_percent <= 100)
    );
    CREATE INDEX idx_users_status ON users (status) WHERE deleted_at IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS users`);
}