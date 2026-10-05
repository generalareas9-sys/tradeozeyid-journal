import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE risk_presets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name text NOT NULL,
      account_id uuid REFERENCES trading_accounts (id) ON DELETE SET NULL,
      balance numeric(20,10),
      risk_percent numeric(6,3),
      risk_amount numeric(20,10),
      direction text CHECK (direction IN ('long', 'short')),
      entry_price numeric(20,10),
      stop_loss numeric(20,10),
      take_profit numeric(20,10),
      broker text,
      symbol text,
      contract_size numeric(20,10),
      lot_step numeric(20,8),
      min_lot numeric(20,8),
      max_lot numeric(20,8),
      pip_value numeric(20,10),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_risk_presets_name CHECK (char_length(name) BETWEEN 1 AND 60),
      CONSTRAINT ck_risk_presets_risk_percent CHECK (risk_percent IS NULL OR (risk_percent > 0 AND risk_percent <= 100)),
      CONSTRAINT ck_risk_presets_balance CHECK (balance IS NULL OR balance >= 0),
      CONSTRAINT ck_risk_presets_risk_amount CHECK (risk_amount IS NULL OR risk_amount > 0),
      CONSTRAINT ck_risk_presets_prices CHECK (
        entry_price IS NULL OR entry_price > 0
      ),
      CONSTRAINT ck_risk_presets_sl CHECK (
        stop_loss IS NULL OR stop_loss > 0
      ),
      CONSTRAINT ck_risk_presets_tp CHECK (
        take_profit IS NULL OR take_profit > 0
      ),
      CONSTRAINT ck_risk_presets_contract CHECK (contract_size IS NULL OR contract_size > 0),
      CONSTRAINT ck_risk_presets_lot_step CHECK (lot_step IS NULL OR lot_step > 0),
      CONSTRAINT ck_risk_presets_lots CHECK (
        (min_lot IS NULL OR min_lot >= lot_step) AND
        (max_lot IS NULL OR max_lot >= min_lot)
      ),
      CONSTRAINT ck_risk_presets_symbol CHECK (
        symbol IS NULL OR (symbol = upper(symbol) AND char_length(symbol) BETWEEN 1 AND 24)
      )
    );
    CREATE INDEX idx_risk_presets_user ON risk_presets (user_id, updated_at DESC);
  `);

  await db.execute(sql`
    CREATE TABLE risk_calculation_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      account_id uuid NOT NULL REFERENCES trading_accounts (id) ON DELETE CASCADE,
      input jsonb NOT NULL,
      result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_risk_calculation_audit_user ON risk_calculation_audit (user_id, created_at DESC);
    CREATE INDEX idx_risk_calculation_audit_account ON risk_calculation_audit (account_id, created_at DESC);
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS risk_calculation_audit`);
  await db.execute(sql`DROP TABLE IF EXISTS risk_presets`);
}