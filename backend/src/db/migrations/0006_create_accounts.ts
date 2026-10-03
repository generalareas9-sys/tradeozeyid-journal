import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE trading_accounts (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name text NOT NULL,
      broker text,
      type account_type NOT NULL DEFAULT 'live',
      status account_status NOT NULL DEFAULT 'active',
      currency char(3) NOT NULL DEFAULT 'USD',
      starting_balance numeric(20,10) NOT NULL,
      timezone text,
      default_risk_percent numeric(6,3) NOT NULL DEFAULT 1.000,
      is_default boolean NOT NULL DEFAULT false,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_trading_accounts_id_user UNIQUE (id, user_id),
      CONSTRAINT ck_trading_accounts_name CHECK (char_length(name) BETWEEN 1 AND 60),
      CONSTRAINT ck_trading_accounts_currency CHECK (currency = upper(currency) AND char_length(currency) = 3),
      CONSTRAINT ck_trading_accounts_starting CHECK (starting_balance >= 0),
      CONSTRAINT ck_trading_accounts_risk CHECK (default_risk_percent > 0 AND default_risk_percent <= 100),
      CONSTRAINT ck_trading_accounts_timezone CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64)
    );
    CREATE UNIQUE INDEX uq_trading_accounts_name ON trading_accounts (user_id, lower(name)) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX uq_trading_accounts_default ON trading_accounts (user_id) WHERE is_default AND deleted_at IS NULL;
    CREATE INDEX idx_trading_accounts_user ON trading_accounts (user_id) WHERE deleted_at IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS trading_accounts`);
}