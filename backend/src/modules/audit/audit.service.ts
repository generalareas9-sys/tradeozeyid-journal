import type { Request } from 'express';
import { getDb } from '../../db/index.js';
import { auditLog } from '../../db/schema/audit.js';
import { getLogger } from '../../lib/logger.js';

/**
 * Audit-log writes (engineering-contract.md §7.13).
 *
 * §7.13 requires an audit row for login, logout, password change, account
 * creation/update, trade create/update/delete and attachment upload/delete.
 * This module owns the writer; each feature calls it with its own action name.
 *
 * Nothing sensitive is ever written: no passwords, no hashes, no tokens, no raw
 * cookies. `metadata` carries non-secret context only.
 *
 * `audit_log.id` is `GENERATED ALWAYS AS IDENTITY`, so the column is omitted on
 * insert and the database assigns it (database-schema.md §3.4).
 */

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.password_change'
  | 'auth.token_reuse_detected';

export interface AuditEntry {
  /** Null for events before a user is known, e.g. a failed login. */
  actorUserId?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}

function clientIp(req?: Request): string | null {
  const raw = req?.ip;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function userAgent(req?: Request): string | null {
  const raw = req?.headers['user-agent'];
  return typeof raw === 'string' ? raw : null;
}

/**
 * Writes one audit row.
 *
 * Never throws into the request path: an audit failure must not turn a
 * successful operation into a 500, but it is logged at error level so it is
 * never silent.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().insert(auditLog).values({
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
      ip: clientIp(entry.req),
      userAgent: userAgent(entry.req),
    });
  } catch (error) {
    getLogger().error(
      {
        action: entry.action,
        error: error instanceof Error ? error.message : String(error),
      },
      'Audit write failed',
    );
  }
}