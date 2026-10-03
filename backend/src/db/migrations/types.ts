import type { SQLWrapper } from 'drizzle-orm';

/**
 * The minimum surface a migration needs from the database. Both the Drizzle
 * client and an open transaction satisfy it, so `up`/`down` behave identically
 * whether or not the runner wraps them in a transaction.
 */
export interface MigrationExecutor {
  execute(query: SQLWrapper): PromiseLike<unknown>;
}

export interface Migration {
  /** File name without extension, e.g. `0003_create_users`. */
  name: string;
  up(db: MigrationExecutor): Promise<void>;
  down(db: MigrationExecutor): Promise<void>;
}