import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE trades (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      account_id uuid NOT NULL,
      strategy_id uuid,
      symbol text NOT NULL,
      direction trade_direction NOT NULL,
      status trade_status NOT NULL DEFAULT 'planned',
      session market_session NOT NULL,
      quantity numeric(20,8) NOT NULL,
      entry_price numeric(20,10) NOT NULL,
      exit_price numeric(20,10),
      stop_loss numeric(20,10) NOT NULL,
      take_profit numeric(20,10),
      entry_time timestamptz NOT NULL,
      exit_time timestamptz,
      contract_size numeric(20,10) NOT NULL DEFAULT 1,
      planned_risk numeric(20,10) NOT NULL,
      risk_percent numeric(6,3),
      fees numeric(20,10) NOT NULL DEFAULT 0,
      swap numeric(20,10) NOT NULL DEFAULT 0,
      pnl numeric(20,10),
      r_multiple numeric(10,4),
      mae numeric(20,10),
      mfe numeric(20,10),
      title text,
      mistake text,
      followed_plan boolean,
      broke_rules boolean,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_trades_id_user UNIQUE (id, user_id),
      CONSTRAINT fk_trades_account FOREIGN KEY (account_id, user_id)
        REFERENCES trading_accounts (id, user_id) ON DELETE RESTRICT,
      CONSTRAINT fk_trades_strategy FOREIGN KEY (strategy_id, user_id)
        REFERENCES strategies (id, user_id) ON DELETE RESTRICT,
      CONSTRAINT ck_trades_symbol CHECK (symbol = upper(symbol) AND char_length(symbol) BETWEEN 1 AND 24),
      CONSTRAINT ck_trades_quantity CHECK (quantity > 0),
      CONSTRAINT ck_trades_planned_risk CHECK (planned_risk > 0),
      CONSTRAINT ck_trades_risk_percent CHECK (risk_percent IS NULL OR (risk_percent > 0 AND risk_percent <= 100)),
      CONSTRAINT ck_trades_fees CHECK (fees >= 0),
      CONSTRAINT ck_trades_swap CHECK (swap = round(swap, 10)),
      CONSTRAINT ck_trades_contract_size CHECK (contract_size > 0),
      CONSTRAINT ck_trades_r_multiple CHECK (r_multiple IS NULL OR r_multiple > -1000),
      CONSTRAINT ck_trades_sl_side CHECK (
        (direction = 'long' AND stop_loss < entry_price) OR
        (direction = 'short' AND stop_loss > entry_price)
      ),
      CONSTRAINT ck_trades_tp_side CHECK (
        take_profit IS NULL OR
        (direction = 'long' AND take_profit > entry_price) OR
        (direction = 'short' AND take_profit < entry_price)
      ),
      CONSTRAINT ck_trades_close_shape CHECK (
        (status <> 'closed') OR
        (exit_price IS NOT NULL AND exit_time IS NOT NULL AND pnl IS NOT NULL AND r_multiple IS NOT NULL)
      ),
      CONSTRAINT ck_trades_exit_only_when_closed CHECK (
        (exit_price IS NULL AND exit_time IS NULL) OR status IN ('closed', 'cancelled')
      ),
      CONSTRAINT ck_trades_open_exit_after_entry CHECK (
        exit_time IS NULL OR exit_time >= entry_time
      )
    );
    CREATE INDEX idx_trades_user_entry ON trades (user_id, entry_time DESC, id DESC);
    CREATE INDEX idx_trades_account_entry ON trades (account_id, entry_time DESC, id DESC);
    CREATE INDEX idx_trades_user_status ON trades (user_id, status);
    CREATE INDEX idx_trades_user_symbol ON trades (user_id, symbol);
    CREATE INDEX idx_trades_user_strategy ON trades (user_id, strategy_id) WHERE strategy_id IS NOT NULL;
    CREATE INDEX idx_trades_open ON trades (user_id, entry_time DESC) WHERE status IN ('planned', 'open') AND deleted_at IS NULL;
    CREATE INDEX idx_trades_user_pnl ON trades (user_id, pnl) WHERE deleted_at IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS trades`);
}