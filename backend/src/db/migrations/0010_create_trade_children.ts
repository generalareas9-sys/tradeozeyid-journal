import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE trade_tags (
      trade_id uuid NOT NULL,
      tag_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (trade_id, tag_id),
      CONSTRAINT fk_trade_tags_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
      CONSTRAINT fk_trade_tags_tag FOREIGN KEY (tag_id, user_id)
        REFERENCES tags (id, user_id) ON DELETE CASCADE
    );
    CREATE INDEX idx_trade_tags_tag ON trade_tags (tag_id, trade_id);
    CREATE INDEX idx_trade_tags_user ON trade_tags (user_id);

    CREATE TABLE trade_executions (
      id uuid PRIMARY KEY,
      trade_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      sequence integer NOT NULL,
      side execution_side NOT NULL,
      price numeric(20,10) NOT NULL,
      quantity numeric(20,8) NOT NULL,
      fee numeric(20,10) NOT NULL DEFAULT 0,
      executed_at timestamptz NOT NULL,
      note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_trade_executions_seq UNIQUE (trade_id, sequence),
      CONSTRAINT fk_trade_executions_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
      CONSTRAINT ck_trade_executions_sequence CHECK (sequence >= 0),
      CONSTRAINT ck_trade_executions_price CHECK (price > 0),
      CONSTRAINT ck_trade_executions_quantity CHECK (quantity > 0),
      CONSTRAINT ck_trade_executions_fee CHECK (fee >= 0)
    );
    CREATE INDEX idx_trade_executions_trade ON trade_executions (trade_id, sequence);

    CREATE TABLE trade_notes (
      id uuid PRIMARY KEY,
      trade_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT fk_trade_notes_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
      CONSTRAINT ck_trade_notes_body CHECK (char_length(body) BETWEEN 1 AND 20000)
    );
    CREATE INDEX idx_trade_notes_trade ON trade_notes (trade_id, created_at);

    CREATE TABLE trade_attachments (
      id uuid PRIMARY KEY,
      trade_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      kind attachment_kind NOT NULL DEFAULT 'screenshot',
      storage_key text NOT NULL,
      original_name text NOT NULL,
      mime_type text NOT NULL,
      byte_size integer NOT NULL,
      width integer,
      height integer,
      checksum_sha256 char(64) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT uq_trade_attachments_key UNIQUE (storage_key),
      CONSTRAINT fk_trade_attachments_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
      CONSTRAINT ck_trade_attachments_size CHECK (byte_size > 0 AND byte_size <= 10485760),
      CONSTRAINT ck_trade_attachments_mime CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
      CONSTRAINT ck_trade_attachments_dims CHECK (
        (kind = 'document') OR (width > 0 AND height > 0 AND width <= 20000 AND height <= 20000)
      ),
      CONSTRAINT ck_trade_attachments_hash CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX idx_trade_attachments_trade ON trade_attachments (trade_id, created_at);
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS trade_attachments`);
  await db.execute(sql`DROP TABLE IF EXISTS trade_notes`);
  await db.execute(sql`DROP TABLE IF EXISTS trade_executions`);
  await db.execute(sql`DROP TABLE IF EXISTS trade_tags`);
}