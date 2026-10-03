import { customType } from 'drizzle-orm/pg-core';

/**
 * `citext` — case-insensitive text. Used for `users.email` so uniqueness and
 * equality are case-insensitive at the database level (database-schema.md §3.1).
 */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/**
 * `inet` — PostgreSQL network address type. Used for `refresh_tokens.ip` and
 * `audit_log.ip` so addresses remain range-comparable.
 */
export const inet = customType<{ data: string }>({
  dataType: () => 'inet',
});