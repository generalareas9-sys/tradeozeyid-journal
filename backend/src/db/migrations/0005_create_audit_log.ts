import { sql } from 'drizzle-orm';
import type { MigrationExecutor } from './types.js';

export async function up(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`
    CREATE TABLE audit_log (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      ip inet,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_audit_log_actor ON audit_log (actor_user_id, created_at DESC);
    CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id, created_at DESC);
    CREATE INDEX idx_audit_log_action ON audit_log (action, created_at DESC);
  `);
}

export async function down(db: MigrationExecutor): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS audit_log`);
}