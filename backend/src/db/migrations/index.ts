import type { Migration } from './types.js';
import * as m0001 from './0001_enable_extensions.js';
import * as m0002 from './0002_create_enums.js';
import * as m0003 from './0003_create_users.js';
import * as m0004 from './0004_create_auth_tokens.js';
import * as m0005 from './0005_create_audit_log.js';
import * as m0006 from './0006_create_accounts.js';
import * as m0007 from './0007_create_strategies.js';
import * as m0008 from './0008_create_tags.js';
import * as m0009 from './0009_create_trades.js';
import * as m0010 from './0010_create_trade_children.js';
import * as m0011 from './0011_create_instrument_specs.js';
import * as m0012 from './0012_create_journal.js';
import * as m0013 from './0013_create_trade_reviews.js';
import * as m0014 from './0014_create_risk_presets.js';

/**
 * The canonical migration sequence (docs/database-schema.md §8, "Migration
 * order"). The order is declared explicitly instead of being read from the
 * filesystem so that the dependency graph cannot be broken silently.
 *
 * 0001 enable_extensions
 * 0002 create_enums
 * 0003 create_users
 * 0004 create_auth_tokens
 * 0005 create_audit_log
 * 0006 create_accounts        (table `trading_accounts`)
 * 0007 create_strategies      (created early so `trades` can reference it)
 * 0008 create_tags            (created early so `trade_tags` can reference it)
 * 0009 create_trades
 * 0010 create_trade_children
 * 0011 create_instrument_specs
 * 0012 create_journal
 * 0013 create_trade_reviews
 * 0014 create_risk_presets
 */
export const migrations: readonly Migration[] = [
  { name: '0001_enable_extensions', ...m0001 },
  { name: '0002_create_enums', ...m0002 },
  { name: '0003_create_users', ...m0003 },
  { name: '0004_create_auth_tokens', ...m0004 },
  { name: '0005_create_audit_log', ...m0005 },
  { name: '0006_create_accounts', ...m0006 },
  { name: '0007_create_strategies', ...m0007 },
  { name: '0008_create_tags', ...m0008 },
  { name: '0009_create_trades', ...m0009 },
  { name: '0010_create_trade_children', ...m0010 },
  { name: '0011_create_instrument_specs', ...m0011 },
  { name: '0012_create_journal', ...m0012 },
  { name: '0013_create_trade_reviews', ...m0013 },
  { name: '0014_create_risk_presets', ...m0014 },
];

export function findMigration(name: string): Migration | undefined {
  return migrations.find((migration) => migration.name === name);
}