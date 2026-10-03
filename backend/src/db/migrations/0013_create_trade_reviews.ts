import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE trade_reviews (
      id uuid PRIMARY KEY,
      trade_id uuid NOT NULL UNIQUE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      confidence_before smallint,
      fear_before smallint,
      fomo_before smallint,
      patience_before smallint,
      followed_plan boolean,
      broke_rules boolean,
      revenge_trade boolean,
      overtraded boolean,
      entered_early boolean,
      moved_stop boolean,
      rules_followed smallint,
      rating smallint,
      body text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_trade_reviews_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
      CONSTRAINT ck_trade_reviews_scale CHECK (
        (confidence_before IS NULL OR confidence_before BETWEEN 1 AND 5) AND
        (fear_before IS NULL OR fear_before BETWEEN 1 AND 5) AND
        (fomo_before IS NULL OR fomo_before BETWEEN 1 AND 5) AND
        (patience_before IS NULL OR patience_before BETWEEN 1 AND 5) AND
        (rules_followed IS NULL OR rules_followed BETWEEN 0 AND 100) AND
        (rating IS NULL OR rating BETWEEN 1 AND 5)
      ),
      CONSTRAINT ck_trade_reviews_body CHECK (body IS NULL OR char_length(body) <= 20000)
    );
    CREATE INDEX idx_trade_reviews_user ON trade_reviews (user_id);
    CREATE INDEX idx_trade_reviews_flags ON trade_reviews (user_id, revenge_trade, overtraded, entered_early, moved_stop)
      WHERE broke_rules IS TRUE;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS trade_reviews`);
}