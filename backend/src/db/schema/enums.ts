import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'deleted']);
export const tokenRevokedReasonEnum = pgEnum('token_revoked_reason', ['logout', 'rotation', 'reuse_detected', 'password_change', 'admin']);
export const accountTypeEnum = pgEnum('account_type', ['live', 'demo', 'prop']);
export const accountStatusEnum = pgEnum('account_status', ['active', 'archived']);
export const tradeDirectionEnum = pgEnum('trade_direction', ['long', 'short']);
export const tradeStatusEnum = pgEnum('trade_status', ['planned', 'open', 'closed', 'cancelled']);
export const marketSessionEnum = pgEnum('market_session', ['sydney', 'tokyo', 'london', 'new_york']);
export const strategyStatusEnum = pgEnum('strategy_status', ['active', 'archived']);
export const executionSideEnum = pgEnum('execution_side', ['entry', 'entry_partial', 'exit', 'exit_partial']);
export const attachmentKindEnum = pgEnum('attachment_kind', ['screenshot', 'chart', 'document']);
export const journalScopeEnum = pgEnum('journal_scope', ['daily', 'weekly', 'monthly', 'custom']);
export const tagCategoryEnum = pgEnum('tag_category', ['setup', 'mistake', 'emotion', 'market', 'custom']);