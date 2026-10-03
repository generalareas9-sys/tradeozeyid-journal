import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE journal_entries (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      account_id uuid,
      entry_date date NOT NULL,
      title text,
      body text NOT NULL DEFAULT '',
      mood_score smallint,
      word_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_journal_entries_id_user UNIQUE (id, user_id),
      -- RESTRICT, not SET NULL: a composite SET NULL would also try to null
      -- user_id and fail on its NOT NULL constraint.
      CONSTRAINT fk_journal_entries_account FOREIGN KEY (account_id, user_id)
        REFERENCES trading_accounts (id, user_id) ON DELETE RESTRICT,
      CONSTRAINT ck_journal_entries_mood CHECK (mood_score IS NULL OR mood_score BETWEEN 1 AND 5),
      CONSTRAINT ck_journal_entries_words CHECK (word_count >= 0),
      CONSTRAINT ck_journal_entries_body CHECK (char_length(body) <= 50000)
    );
    CREATE UNIQUE INDEX uq_journal_entries_day ON journal_entries (user_id, entry_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_journal_entries_user_date ON journal_entries (user_id, entry_date DESC);

    CREATE TABLE journal_emotions (
      id uuid PRIMARY KEY,
      journal_entry_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      emotion text NOT NULL,
      intensity smallint NOT NULL,
      phase text NOT NULL DEFAULT 'before',
      note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_journal_emotions_entry FOREIGN KEY (journal_entry_id, user_id)
        REFERENCES journal_entries (id, user_id) ON DELETE CASCADE,
      CONSTRAINT ck_journal_emotions_emotion CHECK (char_length(emotion) BETWEEN 1 AND 60),
      CONSTRAINT ck_journal_emotions_intensity CHECK (intensity BETWEEN 1 AND 5),
      CONSTRAINT ck_journal_emotions_phase CHECK (phase IN ('before', 'during', 'after'))
    );
    CREATE INDEX idx_journal_emotions_entry ON journal_emotions (journal_entry_id);
    CREATE INDEX idx_journal_emotions_user ON journal_emotions (user_id, emotion);

    CREATE TABLE reviews (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      scope journal_scope NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      title text,
      body text NOT NULL,
      rating smallint,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT ck_reviews_period CHECK (period_end >= period_start),
      CONSTRAINT ck_reviews_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
      CONSTRAINT ck_reviews_body CHECK (char_length(body) BETWEEN 1 AND 100000)
    );
    CREATE UNIQUE INDEX uq_reviews_period ON reviews (user_id, scope, period_start, period_end) WHERE deleted_at IS NULL;
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS reviews`);
  await db.execute(sql`DROP TABLE IF EXISTS journal_emotions`);
  await db.execute(sql`DROP TABLE IF EXISTS journal_entries`);
}