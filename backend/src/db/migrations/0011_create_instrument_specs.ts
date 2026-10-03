import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE instrument_specs (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users (id) ON DELETE CASCADE,
      broker text NOT NULL,
      symbol text NOT NULL,
      contract_size numeric(20,10) NOT NULL DEFAULT 1,
      pip_size numeric(20,10),
      pip_value numeric(20,10),
      lot_step numeric(20,8) NOT NULL DEFAULT 0.01,
      min_lot numeric(20,8) NOT NULL DEFAULT 0.01,
      max_lot numeric(20,8) NOT NULL DEFAULT 100.00000000,
      currency char(3) NOT NULL,
      account_type account_type,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_instrument_specs_user_id UNIQUE (id, user_id),
      CONSTRAINT ck_instrument_specs_symbol CHECK (symbol = upper(symbol) AND char_length(symbol) BETWEEN 1 AND 24),
      CONSTRAINT ck_instrument_specs_contract CHECK (contract_size > 0),
      CONSTRAINT ck_instrument_specs_pipsize CHECK (pip_size IS NULL OR pip_size > 0),
      CONSTRAINT ck_instrument_specs_pipvalue CHECK (pip_value IS NULL OR pip_value > 0),
      CONSTRAINT ck_instrument_specs_lot_step CHECK (lot_step > 0),
      CONSTRAINT ck_instrument_specs_lots CHECK (min_lot >= lot_step AND max_lot >= min_lot),
      CONSTRAINT ck_instrument_specs_currency CHECK (currency = upper(currency) AND char_length(currency) = 3)
    );
    CREATE UNIQUE INDEX uq_instrument_specs_user_symbol
      ON instrument_specs (user_id, lower(broker), lower(symbol), account_type)
      WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX uq_instrument_specs_global_symbol
      ON instrument_specs (lower(broker), lower(symbol), account_type)
      WHERE user_id IS NULL;
    CREATE INDEX idx_instrument_specs_lookup
      ON instrument_specs (lower(broker), lower(symbol)) WHERE user_id IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS instrument_specs`);
}