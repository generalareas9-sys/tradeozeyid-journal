import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
    CREATE TYPE token_revoked_reason AS ENUM ('logout', 'rotation', 'reuse_detected', 'password_change', 'admin');
    CREATE TYPE account_type AS ENUM ('live', 'demo', 'prop');
    CREATE TYPE account_status AS ENUM ('active', 'archived');
    CREATE TYPE trade_direction AS ENUM ('long', 'short');
    CREATE TYPE trade_status AS ENUM ('planned', 'open', 'closed', 'cancelled');
    CREATE TYPE market_session AS ENUM ('sydney', 'tokyo', 'london', 'new_york');
    CREATE TYPE strategy_status AS ENUM ('active', 'archived');
    CREATE TYPE execution_side AS ENUM ('entry', 'entry_partial', 'exit', 'exit_partial');
    CREATE TYPE attachment_kind AS ENUM ('screenshot', 'chart', 'document');
    CREATE TYPE journal_scope AS ENUM ('daily', 'weekly', 'monthly', 'custom');
    CREATE TYPE tag_category AS ENUM ('setup', 'mistake', 'emotion', 'market', 'custom');
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    DROP TYPE IF EXISTS user_status;
    DROP TYPE IF EXISTS token_revoked_reason;
    DROP TYPE IF EXISTS account_type;
    DROP TYPE IF EXISTS account_status;
    DROP TYPE IF EXISTS trade_direction;
    DROP TYPE IF EXISTS trade_status;
    DROP TYPE IF EXISTS market_session;
    DROP TYPE IF EXISTS strategy_status;
    DROP TYPE IF EXISTS execution_side;
    DROP TYPE IF EXISTS attachment_kind;
    DROP TYPE IF EXISTS journal_scope;
    DROP TYPE IF EXISTS tag_category;
  `);
}