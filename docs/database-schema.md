# TradeOzeyid — Database Schema (exact)

Status: **LOCKED for Phase 1**
Last updated: Phase 0.1 (correction pass)
Target: **PostgreSQL 18** (18.4 verified installed locally)
Companion documents: `engineering-contract.md` §5 (data conventions), `api-spec.md`

This is the authoritative schema. The Drizzle schema definitions live in `backend/src/db/schema/`, and the reversible migrations that build this schema are committed under `backend/src/db/migrations/`. The DDL below is the review artifact — it is what a migration must produce.

## Table of contents

1. [Enumerations](#1-enumerations)
2. [Table reference](#2-table-reference)
3. [DDL — identity and access](#3-ddl--identity-and-access)
4. [DDL — trading domain](#4-ddl--trading-domain)
5. [Derived fields and canonical formulas](#5-derived-fields-and-canonical-formulas)
6. [Indexes and query patterns](#6-indexes-and-query-patterns)
7. [Instrument specifications](#7-instrument-specifications)
8. [Reserved for later phases](#8-reserved-for-later-phases)
9. [Migration order and dependency graph](#9-migration-order-and-dependency-graph)
10. [Revision history](#10-revision-history)

---

## 1. Enumerations

```sql
CREATE TYPE user_status          AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE token_revoked_reason AS ENUM ('logout', 'rotation', 'reuse_detected', 'password_change', 'admin');
CREATE TYPE account_type         AS ENUM ('live', 'demo', 'prop');
CREATE TYPE account_status       AS ENUM ('active', 'archived');
CREATE TYPE trade_direction      AS ENUM ('long', 'short');
CREATE TYPE trade_status         AS ENUM ('planned', 'open', 'closed', 'cancelled');
CREATE TYPE market_session       AS ENUM ('sydney', 'tokyo', 'london', 'new_york');
CREATE TYPE strategy_status      AS ENUM ('active', 'archived');
CREATE TYPE execution_side       AS ENUM ('entry', 'entry_partial', 'exit', 'exit_partial');
CREATE TYPE attachment_kind      AS ENUM ('screenshot', 'chart', 'document');
CREATE TYPE journal_scope        AS ENUM ('daily', 'weekly', 'monthly', 'custom');
CREATE TYPE tag_category         AS ENUM ('setup', 'mistake', 'emotion', 'market', 'custom');
```

Enum changes are additive-only. Renaming or removing a value requires a new migration that rewrites data.

---

## 2. Table reference

| Table | Purpose | Phase |
| --- | --- | --- |
| `users` | Identity, preferences, timezone, default risk | 3 |
| `password_reset_tokens` | Single-use password reset | 3 |
| `refresh_tokens` | Rotating refresh token families | 3 |
| `trading_accounts` | Broker/demo/prop accounts | 4 |
| `strategies` | Named, reusable trade setups | 7 |
| `strategy_rules` | Ordered checklist belonging to a strategy | 7 |
| `tags` | User-scoped labels with category | 7 |
| `trades` | Core journal record | 5 |
| `trade_tags` | Trade ↔ tag join | 7 |
| `trade_executions` | Individual fills behind a trade | 6 |
| `trade_notes` | Free-form notes on a trade | 6 |
| `trade_attachments` | Screenshots and documents | 6 |
| `trade_reviews` | Structured psychology and post-trade review | 11 |
| `journal_entries` | Daily journal | 11 |
| `journal_emotions` | Structured emotions attached to a journal entry | 11 |
| `reviews` | Daily / weekly / monthly written reviews | 11 |
| `audit_log` | Security and business event trail | 3 |
| `instrument_specs` | Per-broker-symbol contract specs (contract size, pip value, lot step) | 10 |

Phase column indicates the phase in which the table is **activated for API/UI use**. Several of these tables must be **created by an earlier migration** because later tables depend on them; §9 records both the creation migration and the activation phase. Creation order and activation phase are deliberately not the same thing.

### 2.1 Foundational tables created ahead of their feature phase

`trades` cannot exist before the tables it references. These tables are created early and stay dormant until their feature phase:

| Table | Created in migration | Needed by (FK) | Activated in phase |
| --- | --- | --- | --- |
| `strategies` | 0007 | `trades.strategy_id` | 7 |
| `strategy_rules` | 0007 | — | 7 |
| `tags` | 0008 | `trade_tags.tag_id` | 7 |
| `trade_tags` | 0010 | `tags`, `trades` | 7 |

This resolves the `trades` ↔ `strategies` dependency question directly: **`strategies` is created in migration 0007, `trades` in 0009.** `trades` does not wait for Phase 7, and `strategies` does not wait for Phase 7 either. Both tables appear in the schema from the first trade migration onward. Phase 7 delivers the endpoints and the UI, not the tables.

---

## 3. DDL — identity and access

### 3.1 `users`

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id                  uuid         PRIMARY KEY,
    email               citext       NOT NULL,
    password_hash       text         NOT NULL,
    display_name        text         NOT NULL,
    timezone            text         NOT NULL DEFAULT 'UTC',
    base_currency       char(3)      NOT NULL DEFAULT 'USD',
    locale              text         NOT NULL DEFAULT 'en',
    status              user_status  NOT NULL DEFAULT 'active',
    email_verified_at   timestamptz,
    default_risk_percent numeric(6,3) NOT NULL DEFAULT 1.000,
    last_login_at       timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    deleted_at          timestamptz,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_timezone          CHECK (char_length(timezone) BETWEEN 1 AND 64),
    CONSTRAINT ck_users_display_name      CHECK (char_length(display_name) BETWEEN 1 AND 80),
    CONSTRAINT ck_users_base_currency     CHECK (base_currency = upper(base_currency) AND char_length(base_currency) = 3),
    CONSTRAINT ck_users_default_risk      CHECK (default_risk_percent > 0 AND default_risk_percent <= 100)
);

CREATE INDEX idx_users_status ON users (status) WHERE deleted_at IS NULL;
```

`email` is stored case-insensitively by `citext`; the application lowercases before comparison anyway.

### 3.2 `password_reset_tokens`

```sql
CREATE TABLE password_reset_tokens (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  text        NOT NULL,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_password_reset_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id, created_at DESC);
```

Expiry is 30 minutes. Consumption is single-use; the row is kept for audit and never returned by an API.

### 3.3 `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
    id             uuid                  PRIMARY KEY,
    user_id        uuid                  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id      uuid                  NOT NULL,
    token_hash     text                  NOT NULL,
    issued_at      timestamptz           NOT NULL DEFAULT now(),
    expires_at     timestamptz           NOT NULL,
    rotated_at     timestamptz,
    revoked_at     timestamptz,
    revoked_reason token_revoked_reason,
    user_agent     text,
    ip             inet,

    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT ck_refresh_tokens_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens (user_id, expires_at DESC);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
```

Rotation semantics (`engineering-contract.md` §7.4):

1. Refresh presents an active token → issue a new token in the same `family_id`, set `rotated_at` on the old row.
2. Refresh presents a rotated or revoked token → revoke every token in the `family_id` with reason `reuse_detected`, respond `TOKEN_REUSE_DETECTED`.
3. Logout revokes the presented token's family with reason `logout`.
4. Password change revokes all families with reason `password_change`.

`ip` uses the `inet` type so it can be range-compared if abuse tracking is ever needed.

### 3.4 `audit_log`

```sql
CREATE TABLE audit_log (
    id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id uuid        REFERENCES users (id) ON DELETE SET NULL,
    action        text        NOT NULL,
    entity_type   text        NOT NULL,
    entity_id     uuid,
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    ip            inet,
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor  ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log (action, created_at DESC);
```

Append-only. No update, no delete. `metadata` must never contain credentials, tokens, or note bodies.

---

## 4. DDL — trading domain

### 4.1 `trading_accounts`

```sql
CREATE TABLE trading_accounts (
    id                   uuid           PRIMARY KEY,
    user_id              uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name                 text           NOT NULL,
    broker               text,
    type                 account_type   NOT NULL DEFAULT 'live',
    status               account_status NOT NULL DEFAULT 'active',
    currency             char(3)        NOT NULL DEFAULT 'USD',
    starting_balance     numeric(20,10) NOT NULL,
    timezone             text,
    default_risk_percent numeric(6,3)   NOT NULL DEFAULT 1.000,
    is_default           boolean        NOT NULL DEFAULT false,
    notes                text,
    created_at           timestamptz    NOT NULL DEFAULT now(),
    updated_at           timestamptz    NOT NULL DEFAULT now(),
    deleted_at           timestamptz,

    CONSTRAINT uq_trading_accounts_id_user UNIQUE (id, user_id),
    CONSTRAINT ck_trading_accounts_name       CHECK (char_length(name) BETWEEN 1 AND 60),
    CONSTRAINT ck_trading_accounts_currency   CHECK (currency = upper(currency) AND char_length(currency) = 3),
    CONSTRAINT ck_trading_accounts_starting   CHECK (starting_balance >= 0),
    CONSTRAINT ck_trading_accounts_risk       CHECK (default_risk_percent > 0 AND default_risk_percent <= 100),
    CONSTRAINT ck_trading_accounts_timezone   CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64)
);

-- Partial uniqueness: a table UNIQUE constraint cannot carry a WHERE clause in PostgreSQL,
-- so this must be a partial unique index. See engineering-contract.md §5.6.
CREATE UNIQUE INDEX uq_trading_accounts_name
    ON trading_accounts (user_id, lower(name)) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_trading_accounts_default
    ON trading_accounts (user_id) WHERE is_default AND deleted_at IS NULL;

CREATE INDEX idx_trading_accounts_user
    ON trading_accounts (user_id) WHERE deleted_at IS NULL;
```

Account names are unique per user, case-insensitively, among non-deleted rows. Only one default account per user. `timezone` falls back to `users.timezone` when null.

### 4.2 `strategies`

```sql
CREATE TABLE strategies (
    id          uuid            PRIMARY KEY,
    user_id     uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        text            NOT NULL,
    description text,
    category    text,
    status      strategy_status NOT NULL DEFAULT 'active',
    color       char(7),
    created_at  timestamptz     NOT NULL DEFAULT now(),
    updated_at  timestamptz     NOT NULL DEFAULT now(),
    deleted_at  timestamptz,

    CONSTRAINT uq_strategies_id_user UNIQUE (id, user_id),
    CONSTRAINT ck_strategies_name   CHECK (char_length(name) BETWEEN 1 AND 60),
    CONSTRAINT ck_strategies_color  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT ck_strategies_status CHECK (status <> 'archived' OR deleted_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_strategies_name
    ON strategies (user_id, lower(name)) WHERE deleted_at IS NULL;

CREATE INDEX idx_strategies_user ON strategies (user_id) WHERE deleted_at IS NULL;
```

Strategy names are unique per user, case-insensitively, among non-deleted rows. This table is created in migration **0007**, ahead of the Phase 7 activation phase, because `trades` references it.

### 4.3 `strategy_rules`

```sql
CREATE TABLE strategy_rules (
    id          uuid        PRIMARY KEY,
    strategy_id uuid        NOT NULL REFERENCES strategies (id) ON DELETE CASCADE,
    position    integer     NOT NULL,
    text        text        NOT NULL,
    is_required boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_strategy_rules_position UNIQUE (strategy_id, position),
    CONSTRAINT ck_strategy_rules_position CHECK (position >= 0),
    CONSTRAINT ck_strategy_rules_text     CHECK (char_length(text) BETWEEN 1 AND 500)
);
```

`position` is gapless and starts at 0. The service rewrites positions on reorder inside a transaction.

### 4.4 `tags`

```sql
CREATE TABLE tags (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       text        NOT NULL,
    color      char(7),
    category   tag_category NOT NULL DEFAULT 'custom',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,

    CONSTRAINT uq_tags_id_user UNIQUE (id, user_id),
    CONSTRAINT ck_tags_name  CHECK (char_length(name) BETWEEN 1 AND 40),
    CONSTRAINT ck_tags_color CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX uq_tags_name
    ON tags (user_id, lower(name)) WHERE deleted_at IS NULL;

CREATE INDEX idx_tags_user ON tags (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tags_category ON tags (user_id, category) WHERE deleted_at IS NULL;
```

Tag names are unique per user, case-insensitively, among non-deleted rows. `uq_tags_id_user` exists so `trade_tags` can carry a composite ownership foreign key. Created in migration **0008**, ahead of the Phase 7 activation phase.

### 4.5 `trades` (core)

```sql
CREATE TABLE trades (
    id            uuid            PRIMARY KEY,
    user_id       uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id    uuid            NOT NULL,
    strategy_id   uuid,
    symbol        text            NOT NULL,
    direction     trade_direction NOT NULL,
    status        trade_status    NOT NULL DEFAULT 'planned',
    session       market_session  NOT NULL,
    quantity      numeric(20,8)   NOT NULL,
    entry_price   numeric(20,10)  NOT NULL,
    exit_price    numeric(20,10),
    stop_loss     numeric(20,10)  NOT NULL,
    take_profit   numeric(20,10),
    entry_time    timestamptz     NOT NULL,
    exit_time     timestamptz,
    contract_size numeric(20,10)  NOT NULL DEFAULT 1,
    planned_risk  numeric(20,10)  NOT NULL,
    risk_percent  numeric(6,3),
    fees          numeric(20,10)  NOT NULL DEFAULT 0,
    swap          numeric(20,10)  NOT NULL DEFAULT 0,
    pnl           numeric(20,10),
    r_multiple    numeric(10,4),
    mae           numeric(20,10),
    mfe           numeric(20,10),
    title         text,
    mistake       text,
    followed_plan boolean,
    broke_rules   boolean,
    created_at    timestamptz     NOT NULL DEFAULT now(),
    updated_at    timestamptz     NOT NULL DEFAULT now(),
    deleted_at    timestamptz,

    CONSTRAINT uq_trades_id_user    UNIQUE (id, user_id),

    -- Ownership by construction: a trade cannot reference another user's account or
    -- strategy. ON DELETE RESTRICT, never SET NULL: a composite SET NULL would attempt to
    -- null user_id as well and fail on its NOT NULL constraint.
    CONSTRAINT fk_trades_account   FOREIGN KEY (account_id, user_id)
        REFERENCES trading_accounts (id, user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_trades_strategy  FOREIGN KEY (strategy_id, user_id)
        REFERENCES strategies (id, user_id) ON DELETE RESTRICT,

    CONSTRAINT ck_trades_symbol     CHECK (symbol = upper(symbol) AND char_length(symbol) BETWEEN 1 AND 24),
    CONSTRAINT ck_trades_quantity   CHECK (quantity > 0),
    CONSTRAINT ck_trades_planned_risk CHECK (planned_risk > 0),
    CONSTRAINT ck_trades_risk_percent CHECK (risk_percent IS NULL OR (risk_percent > 0 AND risk_percent <= 100)),
    CONSTRAINT ck_trades_fees       CHECK (fees >= 0),
    CONSTRAINT ck_trades_swap       CHECK (swap = round(swap, 10)),
    CONSTRAINT ck_trades_contract_size CHECK (contract_size > 0),
    CONSTRAINT ck_trades_r_multiple CHECK (r_multiple IS NULL OR r_multiple > -1000),

    -- Stop loss must sit on the losing side of entry.
    CONSTRAINT ck_trades_sl_side CHECK (
        (direction = 'long'  AND stop_loss <  entry_price) OR
        (direction = 'short' AND stop_loss >  entry_price)
    ),

    -- Take profit must sit on the winning side of entry.
    CONSTRAINT ck_trades_tp_side CHECK (
        take_profit IS NULL OR
        (direction = 'long'  AND take_profit > entry_price) OR
        (direction = 'short' AND take_profit < entry_price)
    ),

    -- Closure consistency: exit fields are all-or-nothing.
    CONSTRAINT ck_trades_close_shape CHECK (
        (status <> 'closed') OR
        (exit_price IS NOT NULL AND exit_time IS NOT NULL AND pnl IS NOT NULL AND r_multiple IS NOT NULL)
    ),

    CONSTRAINT ck_trades_exit_only_when_closed CHECK (
        (exit_price IS NULL AND exit_time IS NULL) OR status IN ('closed', 'cancelled')
    ),

    CONSTRAINT ck_trades_open_exit_after_entry CHECK (
        exit_time IS NULL OR exit_time >= entry_time
    )
);

CREATE INDEX idx_trades_user_entry     ON trades (user_id, entry_time DESC, id DESC);
CREATE INDEX idx_trades_account_entry  ON trades (account_id, entry_time DESC, id DESC);
CREATE INDEX idx_trades_user_status    ON trades (user_id, status);
CREATE INDEX idx_trades_user_symbol    ON trades (user_id, symbol);
CREATE INDEX idx_trades_user_strategy  ON trades (user_id, strategy_id) WHERE strategy_id IS NOT NULL;
CREATE INDEX idx_trades_open           ON trades (user_id, entry_time DESC)
    WHERE status IN ('planned', 'open') AND deleted_at IS NULL;
CREATE INDEX idx_trades_user_pnl       ON trades (user_id, pnl) WHERE deleted_at IS NULL;
```

Design notes:

- `session` is `NOT NULL` because it is derived at write time from the UTC clock time of `entry_time` using the precedence table in `engineering-contract.md` §5.3. It cannot be null on a persisted trade.
- `pnl` is **net of fees and swap**. The full formula is §5.1.
- `contract_size` is **snapshotted onto the trade** at write time from `instrument_specs`. It is denormalised on purpose: a later broker spec change must not silently rewrite the P&L of historical trades.
- `planned_risk` is a currency amount, not a percentage. `risk_percent` is the recorded snapshot of the percentage at entry time; it is nullable because a trader may record risk without a percentage.
- `ON DELETE RESTRICT` on the account prevents deleting an account that has trades. Accounts are archived (`status = 'archived'`) or soft-deleted instead.
- **Strategy deletion is handled by the service, not the database.** The composite FK uses `ON DELETE RESTRICT`, because `ON DELETE SET NULL` on `(strategy_id, user_id)` would attempt to null `user_id` and violate its `NOT NULL` constraint. Strategies are soft-deleted in normal operation, so `strategy_id` normally survives. When a strategy is hard-deleted, the service nulls `trades.strategy_id` for that strategy inside a single transaction and writes an audit entry, keeping every trade's history intact.

### 4.6 `trade_tags`

```sql
CREATE TABLE trade_tags (
    trade_id   uuid NOT NULL,
    tag_id     uuid NOT NULL,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (trade_id, tag_id),

    -- Ownership by construction: a tag link can never bridge two users.
    CONSTRAINT fk_trade_tags_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_trade_tags_tag   FOREIGN KEY (tag_id, user_id)
        REFERENCES tags (id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_trade_tags_tag  ON trade_tags (tag_id, trade_id);
CREATE INDEX idx_trade_tags_user ON trade_tags (user_id);
```

Duplicate tags are impossible by primary key. Tag assignment always validates that `tag.user_id = trade.user_id` in the same transaction.

### 4.7 `trade_executions`

```sql
CREATE TABLE trade_executions (
    id          uuid           PRIMARY KEY,
    trade_id    uuid           NOT NULL,
    user_id     uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    sequence    integer        NOT NULL,
    side        execution_side NOT NULL,
    price       numeric(20,10) NOT NULL,
    quantity    numeric(20,8)  NOT NULL,
    fee         numeric(20,10) NOT NULL DEFAULT 0,
    executed_at timestamptz    NOT NULL,
    note        text,
    created_at  timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT uq_trade_executions_seq UNIQUE (trade_id, sequence),
    CONSTRAINT fk_trade_executions_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
    CONSTRAINT ck_trade_executions_sequence CHECK (sequence >= 0),
    CONSTRAINT ck_trade_executions_price    CHECK (price > 0),
    CONSTRAINT ck_trade_executions_quantity CHECK (quantity > 0),
    CONSTRAINT ck_trade_executions_fee      CHECK (fee >= 0)
);

CREATE INDEX idx_trade_executions_trade ON trade_executions (trade_id, sequence);
```

Executions are the audit trail behind a trade's aggregate values. When executions exist, the service recomputes `quantity`, `entry_price`, `exit_price`, `fees` and `pnl` from them (weighted average) so the trade row and its fills can never disagree.

### 4.8 `trade_notes`

```sql
CREATE TABLE trade_notes (
    id         uuid        PRIMARY KEY,
    trade_id   uuid        NOT NULL,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,

    CONSTRAINT fk_trade_notes_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
    CONSTRAINT ck_trade_notes_body CHECK (char_length(body) BETWEEN 1 AND 20000)
);

CREATE INDEX idx_trade_notes_trade ON trade_notes (trade_id, created_at);
```

Notes are append-and-edit, not threaded. Deleting a note never deletes the trade.

### 4.9 `trade_attachments`

```sql
CREATE TABLE trade_attachments (
    id            uuid            PRIMARY KEY,
    trade_id      uuid            NOT NULL,
    user_id       uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind          attachment_kind NOT NULL DEFAULT 'screenshot',
    storage_key   text            NOT NULL,
    original_name text            NOT NULL,
    mime_type     text            NOT NULL,
    byte_size     integer         NOT NULL,
    width         integer,
    height        integer,
    checksum_sha256 char(64)      NOT NULL,
    created_at    timestamptz     NOT NULL DEFAULT now(),
    deleted_at    timestamptz,

    CONSTRAINT uq_trade_attachments_key     UNIQUE (storage_key),
    CONSTRAINT fk_trade_attachments_trade  FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,
    CONSTRAINT ck_trade_attachments_size    CHECK (byte_size > 0 AND byte_size <= 10485760),
    CONSTRAINT ck_trade_attachments_mime    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT ck_trade_attachments_dims    CHECK (
        (kind = 'document') OR (width > 0 AND height > 0 AND width <= 20000 AND height <= 20000)
    ),
    CONSTRAINT ck_trade_attachments_hash    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX idx_trade_attachments_trade ON trade_attachments (trade_id, created_at);
```

`storage_key` is server-generated (`trades/<userId>/<tradeId>/<uuid>.<ext>`). The client-provided filename is stored for display only and is never used to build a path.

### 4.10 `trade_reviews`

```sql
CREATE TABLE trade_reviews (
    id                uuid        PRIMARY KEY,
    trade_id          uuid        NOT NULL UNIQUE,
    user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    confidence_before smallint,
    fear_before      smallint,
    fomo_before      smallint,
    patience_before  smallint,
    followed_plan    boolean,
    broke_rules      boolean,
    revenge_trade    boolean,
    overtraded       boolean,
    entered_early    boolean,
    moved_stop       boolean,
    rules_followed   smallint,
    rating           smallint,
    body             text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_trade_reviews_trade FOREIGN KEY (trade_id, user_id)
        REFERENCES trades (id, user_id) ON DELETE CASCADE,

    CONSTRAINT ck_trade_reviews_scale CHECK (
        (confidence_before IS NULL OR confidence_before BETWEEN 1 AND 5) AND
        (fear_before      IS NULL OR fear_before      BETWEEN 1 AND 5) AND
        (fomo_before      IS NULL OR fomo_before      BETWEEN 1 AND 5) AND
        (patience_before  IS NULL OR patience_before  BETWEEN 1 AND 5) AND
        (rules_followed   IS NULL OR rules_followed   BETWEEN 0 AND 100) AND
        (rating           IS NULL OR rating           BETWEEN 1 AND 5)
    ),
    CONSTRAINT ck_trade_reviews_body CHECK (body IS NULL OR char_length(body) <= 20000)
);

CREATE INDEX idx_trade_reviews_user ON trade_reviews (user_id);
CREATE INDEX idx_trade_reviews_flags ON trade_reviews (user_id, revenge_trade, overtraded, entered_early, moved_stop)
    WHERE broke_rules IS TRUE;
```

One review per trade (`trade_id UNIQUE`). Every psychology field is nullable so a review can be started and finished later. Emotion × result analytics read these columns directly.

### 4.11 `journal_entries`

```sql
CREATE TABLE journal_entries (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id  uuid,
    entry_date  date        NOT NULL,
    title       text,
    body        text        NOT NULL DEFAULT '',
    mood_score  smallint,
    word_count  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
deleted_at timestamptz,

    CONSTRAINT uq_journal_entries_id_user UNIQUE (id, user_id),

    -- RESTRICT, not SET NULL: a composite SET NULL would try to null user_id and fail.
    -- When an account is hard-deleted the service nulls account_id in one transaction.
    CONSTRAINT fk_journal_entries_account FOREIGN KEY (account_id, user_id)
        REFERENCES trading_accounts (id, user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_journal_entries_mood   CHECK (mood_score IS NULL OR mood_score BETWEEN 1 AND 5),
    CONSTRAINT ck_journal_entries_words  CHECK (word_count >= 0),
    CONSTRAINT ck_journal_entries_body   CHECK (char_length(body) <= 50000)
);

CREATE UNIQUE INDEX uq_journal_entries_day
    ON journal_entries (user_id, entry_date) WHERE deleted_at IS NULL;

CREATE INDEX idx_journal_entries_user_date ON journal_entries (user_id, entry_date DESC);
```

One entry per user per calendar date, in the user's timezone. `account_id` scopes the entry to an account but does not change the uniqueness rule.

### 4.12 `journal_emotions`

```sql
CREATE TABLE journal_emotions (
    id               uuid        PRIMARY KEY,
    journal_entry_id uuid        NOT NULL,
    user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emotion          text        NOT NULL,
    intensity        smallint    NOT NULL,
    phase            text        NOT NULL DEFAULT 'before',
    note             text,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_journal_emotions_entry FOREIGN KEY (journal_entry_id, user_id)
        REFERENCES journal_entries (id, user_id) ON DELETE CASCADE,
    CONSTRAINT ck_journal_emotions_emotion   CHECK (char_length(emotion) BETWEEN 1 AND 60),
    CONSTRAINT ck_journal_emotions_intensity CHECK (intensity BETWEEN 1 AND 5),
    CONSTRAINT ck_journal_emotions_phase     CHECK (phase IN ('before', 'during', 'after'))
);

CREATE INDEX idx_journal_emotions_entry ON journal_emotions (journal_entry_id);
CREATE INDEX idx_journal_emotions_user  ON journal_emotions (user_id, emotion);
```

`emotion` is free text at this phase. Phase 11 introduces a user-scoped vocabulary so `Emotion × Result` analytics can aggregate reliably; the column stays `text` so a controlled vocabulary never becomes a migration blocker.

### 4.13 `reviews`

```sql
CREATE TABLE reviews (
    id           uuid          PRIMARY KEY,
    user_id      uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    scope        journal_scope NOT NULL,
    period_start date          NOT NULL,
    period_end   date          NOT NULL,
    title        text,
    body         text          NOT NULL,
    rating       smallint,
    created_at   timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    deleted_at   timestamptz,

    CONSTRAINT ck_reviews_period CHECK (period_end >= period_start),
    CONSTRAINT ck_reviews_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    CONSTRAINT ck_reviews_body   CHECK (char_length(body) BETWEEN 1 AND 100000)
);

CREATE UNIQUE INDEX uq_reviews_period
    ON reviews (user_id, scope, period_start, period_end) WHERE deleted_at IS NULL;
```

Covers daily, weekly and monthly written reviews in one table, so the Reviews view is a single query with a scope filter.

---

## 5. Derived fields and canonical formulas

These are the single source of truth. Implemented once in `backend/src/analytics/`, used by the trade service, the analytics engine, and the risk calculator. Every formula has unit tests against hand-computed fixtures.

### 5.0 Inputs that affect money

A trade's money is determined by five inputs plus the instrument specification. All six are explicit.

| Input | Where it lives | Role |
| --- | --- | --- |
| `entry_price`, `exit_price` | `trades` | Price movement |
| `quantity` | `trades` | Size in lots |
| `contract_size` | `trades.contract_size`, snapshotted from `instrument_specs` | Units per lot. The multiplier that converts price movement × lots into currency |
| `fees` | `trades.fees` | Commission and any per-trade broker charge. Non-negative, always subtracted |
| `swap` | `trades.swap` | Overnight financing. **Signed**: negative is a cost (subtracted), positive is a credit (added) |
| `currency` | `trading_accounts.currency` | The single currency the trade is denominated in |

Contract size is the point that must not be guessed. It is **not** a universal constant:

- **Exness Standard Cent XAUUSDc: contract size 1.** One lot of XAUUSDc controls 1 ounce of gold. A 0.40 lot move of 1.00 in price is $0.40.
- Instruments with contract size 100 (many FX pairs) scale that by 100×.

Because of this, every P&L and risk formula multiplies by `contract_size`, and `contract_size` is snapshotted onto the trade so historical results never change when a broker revises a spec.

### 5.1 P&L

```
price_delta = (exit_price - entry_price)   for direction = 'long'
price_delta = (entry_price - exit_price)   for direction = 'short'

gross_pnl   = price_delta × quantity × contract_size
pnl         = round(gross_pnl - fees + swap, 10)
```

Worked example, matching the GoldRisk Exness Standard Cent XAUUSDc specification (contract size **1**):

```
long  XAUUSDc  0.40 lots
entry 2415.33   exit 2418.94   contract_size 1
fees  1.20      swap -0.80

price_delta = 2418.94 - 2415.33 = 3.61
gross_pnl   = 3.61 × 0.40 × 1   = 1.444
pnl         = 1.444 - 1.20 - 0.80 = -0.556
```

The worked example is deliberately small and slightly negative so it proves fees and swap both apply and that contract size is genuinely 1 rather than an assumed 100. A realistic 1.00 lot example is given in §5.3.

`swap` defaults to `0`. Fees and swap are entered by the trader in MVP and by the import system from Phase 15. Neither is estimated by the backend.

### 5.1a Currency

P&L, fees, swap, risk and balance are **always in `trading_accounts.currency`**. The backend performs **no currency conversion and holds no FX rate table**.

If `instrument_specs.currency` differs from the account's currency, the trade is rejected at write time:

```json
{ "code": "VALIDATION_ERROR", "details": [
  { "path": "symbol", "message": "XAUUSDc settles in USD but account 0198... is denominated in EUR. Currency conversion is not supported." } ] }
```

This is preferable to silently converting with an unknown rate. Multi-currency aggregation is likewise unsupported and returns `null` rather than a guess.

### 5.2 R multiple

```
r_multiple = round(pnl / planned_risk, 4)
```

`planned_risk` is the currency amount risked at entry, and it **also multiplies by contract size**:

```
sl_distance   = |entry_price - stop_loss|
planned_risk  = round(sl_distance × quantity × contract_size, 10)
```

`risk_percent` snapshot at entry time:

```
risk_amount  = account.starting_balance × (risk_percent / 100)
risk_percent = round(risk_amount / account.starting_balance × 100, 3)
```

A trade closed at exactly the stop loss is `r_multiple = -1.0000`. This invariant is asserted in tests.

### 5.3 SL distance, lot sizing, R:R, projected profit (risk calculator)

```
sl_distance = |entry_price - stop_loss|

exact_lot         = risk_amount / (sl_distance × contract_size)
recommended_lot   = floor(exact_lot / lot_step) × lot_step
recommended_lot   = clamp(recommended_lot, min_lot, max_lot)

actual_risk       = sl_distance × recommended_lot × contract_size
rr_ratio          = |take_profit - entry_price| / sl_distance
projected_profit  = rr_ratio × actual_risk
```

`recommended_lot` is floored to `lot_step`, never rounded up, so the calculator under-risks rather than over-risks. A warning is returned when flooring moves `actual_risk` more than 5% below `risk_amount`.

Worked example, Exness Standard Cent XAUUSDc, **contract size 1**, lot step 0.01:

```
balance 10,000   risk 1%  →  risk_amount 100.00
long, entry 2415.33, sl 2412.83, tp 2421.33

sl_distance      = 2.50
exact_lot        = 100.00 / (2.50 × 1) = 40.00 lots
recommended_lot  = floor(40.00 / 0.01) × 0.01 = 40.00
actual_risk      = 2.50 × 40.00 × 1 = 100.00      (exact, no warning)
rr_ratio         = |2421.33 - 2415.33| / 2.50 = 6.00 / 2.50 = 2.4000
projected_profit = 2.4000 × 100.00 = 240.00
```

With **contract size 100** (a typical FX pair) and identical inputs, `exact_lot` is `0.40` and `projected_profit` is unchanged at `240.00` — because the risk amount and the contract size cancel. This is why contract size must be an explicit input and can never be hard-coded.

`contract_size`, `lot_step`, `min_lot`, `max_lot` come from `instrument_specs`, keyed by broker plus symbol. Overrides are accepted per request and returned in the response so a non-default assumption is always visible.

### 5.4 Win / loss classification

```
is_win  = pnl > 0
is_loss = pnl < 0            break-even trades are neither
```

Aggregate metrics:

```
win_rate       = wins / closed_trades × 100            (closed_trades excludes planned/open/cancelled)
loss_rate      = losses / closed_trades × 100
profit_factor  = Σ wins / |Σ losses|                    → null when there are no losses
avg_win        = Σ wins / wins                          → null when wins = 0
avg_loss       = Σ losses / losses                      → null when losses = 0
avg_r          = Σ r_multiple / closed_trades
expectancy     = (win_rate × avg_win) - (loss_rate × |avg_loss|)
```

`profit_factor` returns `null`, never `0` and never `Infinity`, when the denominator is 0. The frontend renders `—`.

### 5.5 Max drawdown

Computed on the equity curve built from closed trades in ascending `exit_time`, seeded with the account's `starting_balance`:

```
equity[i]   = starting_balance + Σ pnl of closed trades up to i
peak        = max(equity[0..i])
drawdown[i] = (peak - equity[i]) / peak × 100
```

Drawdown is reported in both currency and percent, plus `max_drawdown_at` (the timestamp where it occurred).

### 5.6 MAE / MFE

`mae` and `mfe` are nullable in MVP. They are populated only when market data is available (replay Phase 13 or import Phase 15). They are **never** estimated.

### 5.7 Currency handling

Every account has exactly one `currency`. All analytics for an account are computed in that currency and returned with an explicit currency code. Cross-account aggregation on the dashboard sums only accounts sharing the same currency, and the response states which accounts were included.

Converting currencies is out of scope for MVP. When required later, it converts at the trade's `entry_time` rate from a rate table, never at the current rate.

---

## 6. Indexes and query patterns

| Query | Index used |
| --- | --- |
| Trades list (default, newest first) | `idx_trades_user_entry` |
| Trades filtered by account | `idx_trades_account_entry` |
| Open-trade watchlist | `idx_trades_open` |
| Dashboard equity curve | `idx_trades_user_entry` + `status = 'closed'` filter |
| Per-strategy rollup | `idx_trades_user_strategy` |
| Per-symbol rollup | `idx_trades_user_symbol` |
| Tag-filtered trades | `idx_trade_tags_tag` join |
| Analytics date range | `idx_trades_user_entry` (range scan on `entry_time`) |

Cursor pagination uses the `(entry_time DESC, id DESC)` ordering of `idx_trades_user_entry`, which is a proper keyset scan. Deep `OFFSET` pagination is not offered for `trades` because it degrades on large datasets; analytics aggregates never paginate at all.

Before adding an index, the expected plan must be checked with `EXPLAIN`. New indexes require a written justification.

---

## 7. Instrument specifications

P&L and lot sizing cannot be computed without a contract size, so the specification is a first-class table rather than a hard-coded constant.

```sql
CREATE TABLE instrument_specs (
    id             uuid          PRIMARY KEY,
    user_id        uuid          REFERENCES users (id) ON DELETE CASCADE,
    broker         text          NOT NULL,
    symbol         text          NOT NULL,
    contract_size  numeric(20,10) NOT NULL DEFAULT 1,
    pip_size       numeric(20,10),
    pip_value      numeric(20,10),
    lot_step       numeric(20,8)  NOT NULL DEFAULT 0.01,
    min_lot        numeric(20,8)  NOT NULL DEFAULT 0.01,
    max_lot        numeric(20,8)  NOT NULL DEFAULT 100.00000000,
    currency       char(3)       NOT NULL,
    account_type   account_type,
    is_default     boolean       NOT NULL DEFAULT false,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT uq_instrument_specs_user_id  UNIQUE (id, user_id),
    CONSTRAINT ck_instrument_specs_symbol       CHECK (symbol = upper(symbol) AND char_length(symbol) BETWEEN 1 AND 24),
    CONSTRAINT ck_instrument_specs_contract     CHECK (contract_size > 0),
    CONSTRAINT ck_instrument_specs_pipsize      CHECK (pip_size IS NULL OR pip_size > 0),
    CONSTRAINT ck_instrument_specs_pipvalue     CHECK (pip_value IS NULL OR pip_value > 0),
    CONSTRAINT ck_instrument_specs_lot_step     CHECK (lot_step > 0),
    CONSTRAINT ck_instrument_specs_lots         CHECK (min_lot >= lot_step AND max_lot >= min_lot),
    CONSTRAINT ck_instrument_specs_currency     CHECK (currency = upper(currency) AND char_length(currency) = 3)
);

-- One user-owned spec per broker/symbol/account_type.
CREATE UNIQUE INDEX uq_instrument_specs_user_symbol
    ON instrument_specs (user_id, lower(broker), lower(symbol), account_type)
    WHERE user_id IS NOT NULL;

-- Global (user_id IS NULL) specs shared by every user, seeded by the application.
CREATE UNIQUE INDEX uq_instrument_specs_global_symbol
    ON instrument_specs (lower(broker), lower(symbol), account_type)
    WHERE user_id IS NULL;

CREATE INDEX idx_instrument_specs_lookup
    ON instrument_specs (lower(broker), lower(symbol)) WHERE user_id IS NULL;
```

Rules:

- `user_id IS NULL` marks a **global seed spec** shipped with the application. User-owned rows override global rows for the same broker and symbol.
- Seeded in Phase 10 for the owner's primary workflow, starting with **Exness Standard Cent `XAUUSDc`, contract size 1**, `lot_step` 0.01, currency USD. `account_type` is `live` for the Standard Cent row; a distinct `prop` or `demo` row is added only if the owner confirms different specs.
- The trade service resolves the spec once at write time and **snapshots `contract_size` onto the trade**. Historical P&L therefore never changes if a spec is later corrected.
- `pip_value` is used by the risk calculator when the trader does not override it. When absent, `contract_size` and `sl_distance` fully determine lot size, so `pip_value` is optional rather than required.

## 8. Reserved for later phases

Names are reserved now so no later phase creates conflicting objects. **No migration is created for these until their phase begins.**

| Phase | Tables |
| --- | --- |
| 13 (Replay) | `market_data`, `replay_sessions`, `replay_decisions` |
| 14 (Backtesting) | `backtest_sessions`, `backtest_rules`, `backtest_trades` |
| 15 (Import) | `imports`, `import_rows`, `import_mappings` |
| 17 (Analytics caching) | `analytics_snapshots` |

`progress_checkpoints` and `progress_metrics` are **not reserved to any phase**. The Progress area appears in the blueprint's product map but has no assigned phase in Phases 1–17, and Phase 8 is the Dashboard. These tables are therefore left unassigned pending an owner decision; see "Unresolved owner decisions" in `docs/README.md`. Inventing a schema for them here would be inventing a product requirement.

### 8.1 Backtest isolation (confirmed)

`trades` does **not** get a `source`, `is_simulated`, or `backtest_session_id` column in MVP or in any planned phase.

Backtest results live **only** in `backtest_trades`, a separate table with its own foreign keys. Every analytics query in §6 reads `trades` exclusively. There is therefore no code path by which a simulated result can enter a live-account statistic, and no filter flag exists that could accidentally include one.

An `is_simulated` boolean on `trades` is explicitly rejected: it would make "forgot to filter" a data-corruption bug rather than a structural impossibility.

## 9. Migration order and dependency graph

| # | Migration | Contents | Notes |
| --- | --- | --- | --- |
| 0001 | `enable_extensions` | `citext` | |
| 0002 | `create_enums` | All enum types | |
| 0003 | `create_users` | `users` | Identity |
| 0004 | `create_auth_tokens` | `password_reset_tokens`, `refresh_tokens` | Auth |
| 0005 | `create_audit_log` | `audit_log` | Audit |
| 0006 | `create_accounts` | `trading_accounts` | Accounts |
| 0007 | `create_strategies` | `strategies`, `strategy_rules` | **Created early** so `trades` can reference `strategies(id, user_id)` |
| 0008 | `create_tags` | `tags` | **Created early** so `trade_tags` and `trades` dependencies are satisfied |
| 0009 | `create_trades` | `trades` | Core journal record |
| 0010 | `create_trade_children` | `trade_tags`, `trade_executions`, `trade_notes`, `trade_attachments` | Joins and child tables |
| 0011 | `create_instrument_specs` | `instrument_specs` | Phase 10 activation |
| 0012 | `create_journal` | `journal_entries`, `journal_emotions`, `reviews` | Daily journal |
| 0013 | `create_trade_reviews` | `trade_reviews` | Psychology per trade |

#### Dependency graph

```text
0001→0002→0003→0004,0005
0003→0006 (accounts references users)
0003→0007 (strategies/tags will reference users)
0003→0008
0003,0006,0007→0009 (trades → users, accounts(id,user_id), strategies(id,user_id))
0003,0009,0008→0010 (trade_tags/executions/notes/attachments reference trades and tags)
0003→0011 (instrument_specs references users)
0003,0006→0012 (journal references users, accounts)
0003,0009→0013 (trade_reviews references trades)
```

Notes on the graph:

- `strategies` and `tags` appear before `trades` and `trade_tags` by design. This makes the composite foreign keys valid, removes circularity, and means **Phase 7's UI/CRUD does not create these tables — it only activates them.**
- The partial unique rules become **partial unique indexes** in every migration that creates them (§5.6). Drizzle must not emit a `UNIQUE CONSTRAINT ... WHERE` on the table.
- `instrument_specs` is created in **0011**, and its API is delivered in **Phase 10**. Seeds for the initial Exness XAUUSDc row (contract size 1) are applied in Phase 10.
- `journal` tables (0012) and `trade_reviews` (0013) are created after `instrument_specs` but do not depend on it. Migration order is sequential; phase activation order is independent.

Migration format (intentional, owner-confirmed):

- **A migration is a TypeScript module, not a `.sql` file.** Each file in `backend/src/db/migrations/` is named `NNNN_<snake_description>.ts` and exports two functions: `up(db)` and `down(db)`. This is the project's chosen format, not a temporary scaffold.
- `up` creates the objects listed above; `down` is its exact inverse. Reversibility is a hard requirement, because `npm run db:rollback` executes `down` (§9, "Rollback behavior").
- The applied sequence is declared explicitly in `backend/src/db/migrations/index.ts` rather than discovered from the filesystem, so the dependency graph above cannot be broken silently by a directory listing.
- Each `up`/`down` pair runs inside its own transaction, and the applied name is recorded in the `schema_migrations` history table (the "`__drizzle_migrations` table (or equivalent)" permitted above).
- The migration modules are executed through the Drizzle client, so every statement goes over a bound connection. They contain DDL only — no data access and no string interpolation.

Migration rules:

- One logical change per migration, numbered sequentially, never edited after being merged.
- Every migration is reversible. Destructive changes use expand/contract: add → backfill → switch → drop across separate releases.
- Migrations apply cleanly to an empty database in a single pass; this is verified in CI from Phase 3 onward.

`npm run db:generate` (drizzle-kit) is a **review and drift-detection tool only**. Its SQL output is written to `backend/src/db/generated/`, which is not committed and is never applied by `npm run db:migrate`. Two reasons:

- **drizzle-kit 0.24.2 does not emit `CHECK` constraints.** Its generated SQL contains no `ck_*` rules, so using that output as a migration would silently drop every check constraint in §3 and §4.
- drizzle-kit 0.24 loads the schema through a CommonJS require hook that cannot follow the NodeNext ESM `.js` specifiers used by `backend/src/db/schema/`, so the schema is compiled first (`tsc`) and read from `backend/dist/db/schema/index.js`.

The migration modules remain the single authoritative source of the schema.

### Rollback behavior (`npm run db:rollback`)

- **Reverts exactly one migration** — the most recently applied — by executing its `down` SQL.
- **Refuses to run** if `NODE_ENV=production` (exit code 1, error message).
- **Refuses to run** if the connected database URL does not match `DATABASE_URL_TEST` (exit code 1, error message). This prevents accidental rollback on the development or production database.
- The command reads the applied migration history from the `__drizzle_migrations` table (or equivalent) to identify the latest migration.
- A rollback is only safe when the migration's `down` SQL is the exact inverse of its `up` SQL. Migrations that perform irreversible data transformations (e.g., `DROP COLUMN` with data loss) must be flagged in the migration file and require an explicit `--force` flag (not implemented in Phase 1; documented for future).
- Rollback does not cascade; each `db:rollback` invocation reverts one migration. To revert N migrations, run the command N times.

---

## 10. Revision history

| Date | Phase | Change |
| --- | --- | --- |
| Phase 0 | 0 | Initial schema locked |
| Phase 0.1 | 0.1 | PostgreSQL 18 target; removed invalid partial unique constraints, switched to partial unique indexes, corrected composite FKs to avoid nulling `user_id`, added `instrument_specs`, extended P&L/risk formulas to include contract size/swap, locked canonical session derivation with overlap precedence, clarified ownership and migration dependencies |
| Phase 1 | 1 | Owner-confirmed migration format: migrations are TypeScript modules with `up`/`down`, not generated `.sql` files; migration 0006 named `create_accounts` in this document to match the canonical sequence and the committed file; recorded the drizzle-kit 0.24 CHECK-constraint limitation and that `db:generate` output is review-only; removed the duplicated migration-order heading and renumbered the revision-history section to 10, so the body now matches the table of contents and the `§9` reference in §2. No schema, DDL, index or constraint changed |