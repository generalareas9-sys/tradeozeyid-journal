# TradeOzeyid — Engineering Contract

Status: **LOCKED for Phase 1**
Last updated: Phase 2 (ADR-014 design direction: light-and-purple)
Owner: project source of truth for OpenCode

This document is binding. If implementation and this document disagree, the document wins until it is changed deliberately.

Related documents:

| Document | Purpose |
| --- | --- |
| `docs/database-schema.md` | Exact relational schema, DDL, constraints, indexes |
| `docs/api-spec.md` | Exact HTTP contract, envelopes, endpoints |
| `AGENTS.md` | Operating rules for OpenCode |
| `docs/phase-plan.md` | Phase-by-phase deliverables and verification gates |

---

## 1. Locked decisions (ADRs)

| ID | Decision | Rationale | Status |
| --- | --- | --- | --- |
| ADR-001 | Monorepo: `frontend/`, `backend/`, `database/`, `docs/`, `packages/` | Single repository, single source of truth for contract | Accepted |
| ADR-002 | Frontend: React + TypeScript + Vite + Tailwind CSS | Blueprint §4 | Accepted |
| ADR-003 | Backend: Node.js + Express + TypeScript, REST API | Blueprint §4 | Accepted |
| ADR-004 | Database: **PostgreSQL 18**, local instance on the development machine, accessed via `DATABASE_URL` | PostgreSQL 18.4 is already installed and running locally, so no paid or cloud database is required | Accepted (revised in 0.1) |
| ADR-005 | Data access: Drizzle ORM with SQL-first schema definitions | Typed queries, explicit SQL, real migrations, no hidden runtime magic | Accepted |
| ADR-006 | Auth: JWT access token + opaque rotating refresh token, both in `httpOnly` cookies | XSS resistance is a hard requirement (Phase 17 goal); requires an explicit CSRF strategy (§7) | Accepted |
| ADR-007 | Password hashing: Argon2id | Current OWASP recommendation | Accepted |
| ADR-008 | IDs: UUIDv7 generated in the application layer | Time-ordered (index locality), no database extension dependency, no sequence coordination | Accepted |
| ADR-009 | Money and prices: `NUMERIC`, never floating point | Trading precision requires exact arithmetic | Accepted |
| ADR-010 | API versioning: URL path `/api/v1` | Explicit, cacheable, trivial to route | Accepted |
| ADR-011 | Tests: Vitest (backend unit), Supertest (API), Vitest + React Testing Library (frontend) | Blueprint §4 | Accepted |
| ADR-012 | No Redis/BullMQ in MVP | Blueprint §5 | Accepted |
| ADR-013 | npm workspaces | `npm` is available; `pnpm`/`yarn` are not installed. Avoid adding a package manager to the critical path | Accepted |
| ADR-014 | Frontend design direction: **light** workspace — white cards on a very light lavender canvas, purple/violet accent, near-black primary text. Token table is `docs/phase-plan.md` Phase 2, "Design token system" | The owner changed the direction from the original dark-and-gold palette after reviewing modern light trading-journal references. A light workspace suits long reading and review sessions. Design-system and UI/UX scope only: schema, API contract, security, architecture and testing gates are untouched | Accepted (revised in Phase 2) |

### Explicitly deferred

Not decided in Phase 0, and **must not** be assumed during implementation:

- Object storage provider for trade attachments (local disk in dev; provider decision at Phase 6).
- Charting library for the equity curve and replay (Phase 8 / 13).
- AI provider and model (Phase 16).
- Broker import adapters beyond Exness (Phase 15).

---

## 2. Environment baseline

Verified on the development machine (Phase 0.1 re-inspection):

```
node      v24.18.0
npm       11.16.0
git       2.55.0.windows.3
docker    NOT AVAILABLE
psql      NOT ON PATH, but installed at
          C:\Program Files\PostgreSQL\18\bin\psql.exe  (PostgreSQL 18.4)
service   postgresql-x64-18  RUNNING
listener  localhost:5432   accepting connections
auth      scram-sha-256 for local, 127.0.0.1/32 and ::1/128
data dir  C:\Program Files\PostgreSQL\18\data
extensions citext, pgcrypto, uuid-ossp, btree_gin, pg_trgm  (all available)
```

Consequences:

1. **PostgreSQL 18 is the locked target.** No cloud database, no subscription, and no Docker is required.
2. Provisioning is an **owner task at the start of Phase 1**, not a Phase 0 decision. Phase 1 first re-inspects the environment and reuses this instance if it is still present.
3. If PostgreSQL 18 is missing, the owner is guided through a local setup (installer or a package manager). No silent fallback to a cloud provider.
4. `DATABASE_URL` points at the local instance over TCP to `127.0.0.1:5432` using `scram-sha-256`. Credentials live in `.env` only.
5. Migrations run through npm scripts (`npm run db:migrate`). A `psql` binary may be used for **manual owner inspection only**, never as the migration mechanism.
6. The repository is **not yet** a git repository. `git init` is a Phase 1 task.

### Phase 1 provisioning checklist (owner)

- [ ] Confirm `postgresql-x64-18` is running (`Get-Service postgresql-x64-18`)
- [ ] Confirm `pg_isready` reports `accepting connections`
- [ ] Confirm the `psql` bin directory is on `PATH`, or invoke it by full path
- [ ] Create the application role and databases (`tradeozeyid` and `tradeozeyid_test`)
- [ ] Put the connection strings in `.env`; never commit them
- [ ] Confirm the test database exists so migrations can be verified against an empty database

The `tradeozeyid_test` database is mandatory, not optional: the verification gate requires migrations to be proven against an empty database.

### Test database connection (mandatory)

Two environment variables control database targeting:

| Variable | Purpose | Required in |
| --- | --- | --- |
| `DATABASE_URL` | Development database (`tradeozeyid`) | all environments |
| `DATABASE_URL_TEST` | Test database (`tradeozeyid_test`) | `test` environment only |

**Protection against wrong database targeting:**

- The test runner (`vitest` with Supertest) **must** set `DATABASE_URL=DATABASE_URL_TEST` before importing the app.
- The application's config module **must** validate at startup: if `NODE_ENV === 'test'` and `DATABASE_URL_TEST` is not set, throw an error and exit.
- The application's config module **must** validate: if `NODE_ENV !== 'test'` and `DATABASE_URL_TEST` is set, log a warning but continue (allows local test runs against dev DB if explicitly intended).
- The test harness **must not** import or use `DATABASE_URL` directly.
- A unit test asserts that a test-mode app rejects startup when `DATABASE_URL_TEST` is missing.
- CI pipeline sets `DATABASE_URL_TEST` to the ephemeral test database; production/development never set it.

---

## 3. Repository layout

```
tradeozeyid/
├── AGENTS.md                    Operating rules for OpenCode
├── package.json                 npm workspaces root
├── package-lock.json
├── .env.example                 Every variable name, no values
├── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── app/                 Router, providers, layout
│   │   ├── components/          Reusable UI
│   │   ├── features/            Feature-scoped UI + hooks
│   │   ├── lib/                 HTTP client, query cache, formatters
│   │   ├── styles/              Tailwind entry + design tokens
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
│
├── backend/
│   ├── src/
│   │   ├── app.ts               Express app assembly
│   │   ├── server.ts            Process entry, graceful shutdown
│   │   ├── config/              Env parsing and validation (fail fast)
│   │   ├── db/                  Drizzle client, schema, migrations runner
│   │   │   ├── schema/          One file per domain (auth, account, trade…)
│   │   │   └── migrations/      Generated SQL, committed
│   │   ├── modules/             Vertical feature modules
│   │   │   └── <feature>/
│   │   │       ├── <feature>.routes.ts
│   │   │       ├── <feature>.service.ts
│   │   │       ├── <feature>.schema.ts      Zod request validation
│   │   │       └── <feature>.repository.ts   Drizzle queries
│   │   ├── middleware/          auth, csrf, error, rateLimit, validate
│   │   ├── lib/                 Errors, logger, ids, money, time, crypto
│   │   └── analytics/           Pure calculation functions
│   ├── tests/
│   │   ├── unit/
│   │   └── api/
│   └── package.json
│
├── packages/
│   └── contracts/               Shared TypeScript types (API DTOs, filter shape)
│
├── database/
│   ├── seeds/                   Seed scripts (dev users, tags, strategies)
│   └── ERD.md                   Human-readable diagram + notes
│
└── docs/
    ├── engineering-contract.md
    ├── database-schema.md
    ├── api-spec.md
    └── phase-plan.md
```

Rules:

- Module folders are **vertical slices**. A feature's routes, service, validation and queries live together. Do not create `controllers/`, `services/`, `repositories/` as sibling top-level trees.
- Business logic never lives in route files.
- Frontend `features/` folders mirror backend modules one-to-one where they share a domain.

---

## 4. Naming and formatting conventions

| Concern | Rule | Example |
| --- | --- | --- |
| Table names | plural, `snake_case` | `trading_accounts` |
| Column names | `snake_case`, singular | `entry_price` |
| Primary key | always `id` | — |
| Foreign key | `<singular_entity>_id` | `account_id`, `strategy_id` |
| Timestamps | `_at` suffix, `timestamptz` | `entry_time`, `created_at` |
| Calendar dates | `entry_date` as `date` | `entry_date` |
| Enums | `snake_case` type name, lowercase values | `trade_status` / `'open'` |
| Indexes | `idx_<table>_<columns>` | `idx_trades_user_entry_time` |
| Unique constraints | `uq_<table>_<columns>` | `uq_trades_id_user` |
| Check constraints | `ck_<table>_<rule>` | `ck_trades_sl_side` |
| Migrations | `NNNN_<snake_description>.sql` | `0007_create_trades.sql` |
| Rollback | `npm run db:rollback` — reverts the **last applied migration** by running its `down` SQL; refuses to run if `NODE_ENV=production` or if the target database is not `DATABASE_URL_TEST` | |
| TS files | `camelCase.ts` or `<kebab>.ts` for routes | `trades.routes.ts` |
| API paths | plural `kebab-case`, camelCase params | `/api/v1/trading-accounts` |
| API query/body keys | `camelCase` | `plannedRisk` |
| Env vars | `SCREAMING_SNAKE_CASE` | `DATABASE_URL` |
| React components | `PascalCase.tsx`, one component per file | `TradeTable.tsx` |

API keys are camelCase, database columns are snake_case. A single translation point exists per module (`repository.ts`). Never leak column names into DTOs.

---

## 5. Data conventions (binding)

### 5.1 Identifiers

- Type: `uuid` (UUIDv7).
- Generated by the application layer at insert time (`lib/ids.ts`), **never** by a database default.
- Client-generated IDs are accepted only for resources that must be created offline; the server always validates ownership when adopting them. This is not used in MVP.

### 5.2 Money, prices, quantities

| Concept | PostgreSQL type | Notes |
| --- | --- | --- |
| Price (entry, exit, SL, TP) | `numeric(20,10)` | 10 decimals; covers XAUUSDc and crypto |
| Quantity | `numeric(20,8)` | 8 decimals; covers micro-lots |
| Currency amount (P&L, fees, planned risk, balance) | `numeric(20,10)` | Same scale everywhere, no exceptions |
| Risk percent | `numeric(6,3)` | 0–100, 3 decimals |
| R multiple | `numeric(10,4)` | Signed, e.g. `-1.0000` |
| Swap (financing cost) | `numeric(20,10)` | Signed; negative is a cost, positive is a credit |
| Contract size | `numeric(20,10)` | Instrument spec, snapshotted onto the trade |
| MAE / MFE | `numeric(20,10)` | Price distances, nullable until replay/import supplies them |
| Currency code | `char(3)` | ISO 4217 uppercase, stored on `trading_accounts` and on `instrument_specs` |

Hard rules:

1. **No `float`/`real`/`double precision`** anywhere in the schema.
2. No JavaScript `number` is used for money or price in persisted data paths. `numeric` is transported as a **JSON string** (see `api-spec.md` §4) to avoid IEEE-754 precision loss.
3. All arithmetic that produces a persisted value goes through a single documented formula (`database-schema.md` §5). Formulas are implemented once in `backend/src/analytics/` and unit-tested against hand-computed fixtures.
4. Rounding: money values are rounded half-up to 10 decimal places on write; R multiples to 4 decimal places. Rounding happens once, at the boundary, never in intermediate calculations.
5. **Currency conversion is not supported.** Every trade is recorded in its account's `currency`. If an instrument settles in a different currency, the trade is rejected with `VALIDATION_ERROR` rather than silently converted. There is no FX rate table in the schema, and none may be assumed.

### 5.3 Time

- All timestamps are `timestamptz`, stored and returned in UTC, ISO-8601 with a trailing `Z`.
- Every user has a `timezone` (IANA name, e.g. `Europe/Istanbul`). Every trading account may override it.
- `market_session` is **derived at write time** and stored as an enum. It is never derived at query time, so indexes and filters stay fast and results are stable across timezone changes.
- Calendar analytics (`by day`, `by week`, `by month`, calendar heatmap) group by the **account timezone**, never by UTC date.

#### Canonical session interpretation (locked)

Session boundaries are defined **in UTC**. The derivation converts `entry_time` to the account's timezone only to determine the *local trading date*; the session itself is assigned from the **UTC clock time** of `entry_time`.

Worked example: `entry_time = 2026-09-30T07:45:00Z`, account timezone `Europe/Istanbul` (UTC+3).
Local time is `10:45`, so the trade belongs to local trading date `2026-09-30`.
UTC clock time is `07:45`, which falls in the `london` window (07:00–16:00), so `session = 'london'`.

This is unambiguous and deliberately **not** timezone-dependent: two traders in different timezones entering at the same absolute instant receive the same session. Session is a property of the market, not of the trader.

Boundaries and overlap resolution:

| Session | UTC window | Wraps midnight |
| --- | --- | --- |
| `sydney` | 20:00 – 05:00 | yes |
| `tokyo` | 00:00 – 09:00 | no |
| `london` | 07:00 – 16:00 | no |
| `new_york` | 12:00 – 21:00 | no |

Windows overlap, so a fixed precedence order resolves every ambiguity. Evaluate windows in this order and assign the **first match**:

1. `new_york` — 12:00 ≤ t < 21:00
2. `london` — 07:00 ≤ t < 16:00
3. `tokyo` — 00:00 ≤ t < 09:00
4. `sydney` — t ≥ 20:00 or t < 05:00

Consequences, stated explicitly so no implementation has to guess:

- 12:00–16:00 UTC is `new_york`, not `london` (New York takes precedence in the London/New York overlap).
- 07:00–09:00 UTC is `london`, not `tokyo`.
- 20:00–21:00 UTC is `new_york`, not `sydney`.
- 00:00–05:00 UTC is `tokyo`, not `sydney` (Tokyo precedes Sydney).
- 05:00–07:00 UTC is `tokyo`, because it lies inside Tokyo's defined window (00:00–09:00 UTC) and outside every other window (`london` starts at 07:00, `new_york` starts at 12:00, `sydney` ends at 05:00). Tokyo is therefore the first and the only match: this period is covered by a session window, it is not a gap.
- Boundaries are half-open, left-closed right-open: a trade at exactly `07:00:00Z` is `london`; at exactly `16:00:00Z` it is `new_york`.

The implementation is a single pure function with a table-driven lookup and unit tests covering each boundary instant above.

### 5.4 Soft deletes

`trades`, `strategies`, `tags`, `trading_accounts`, `journal_entries`, `trade_notes`, `trade_attachments`, `reviews` carry `deleted_at timestamptz NULL`. Hard delete is reserved for `refresh_tokens`, `trade_tags`, `trade_executions`, `journal_emotions`, `audit_log`.

All uniqueness constraints on soft-deleted tables are partial: `WHERE deleted_at IS NULL`.

Every list endpoint filters `deleted_at IS NULL` by default.

### 5.5 Ownership integrity at the database level

Application-layer authorization checks are mandatory. The schema additionally makes cross-user references **structurally impossible** so a service-layer bug cannot leak data.

Every table that is owned by a user carries `user_id NOT NULL`. Every table that can be the target of a user-scoped reference carries `UNIQUE (id, user_id)`, which is the target for a composite foreign key.

```
users, refresh_tokens, password_reset_tokens, trading_accounts, strategies,
tags, trades, trade_executions, trade_notes, trade_attachments, trade_reviews,
journal_entries, journal_emotions, reviews, trade_tags, instrument_specs
```

Composite foreign keys in force:

| Child | Composite FK | Deletes as |
| --- | --- | --- |
| `trades` | `(account_id, user_id) → trading_accounts(id, user_id)` | `ON DELETE RESTRICT` |
| `trades` | `(strategy_id, user_id) → strategies(id, user_id)` | `ON DELETE RESTRICT` (see below) |
| `trade_tags` | `(trade_id, user_id) → trades(id, user_id)` | `ON DELETE CASCADE` |
| `trade_tags` | `(tag_id, user_id) → tags(id, user_id)` | `ON DELETE CASCADE` |
| `trade_executions` | `(trade_id, user_id) → trades(id, user_id)` | `ON DELETE CASCADE` |
| `trade_notes` | `(trade_id, user_id) → trades(id, user_id)` | `ON DELETE CASCADE` |
| `trade_attachments` | `(trade_id, user_id) → trades(id, user_id)` | `ON DELETE CASCADE` |
| `trade_reviews` | `(trade_id, user_id) → trades(id, user_id)` | `ON DELETE CASCADE` |
| `journal_emotions` | `(journal_entry_id, user_id) → journal_entries(id, user_id)` | `ON DELETE CASCADE` |

Two consequences are deliberate:

1. **`ON DELETE SET NULL` is never used on a composite foreign key that includes `user_id`.** PostgreSQL would attempt to null the whole column list, including the `NOT NULL` ownership column, and the delete would fail. Where a nullable reference must survive deletion, the column is nulled by the service inside an explicit transaction, and the FK uses `ON DELETE RESTRICT`.
2. **Because every user-owned child row carries a composite FK to its parent, a child can never reference another user's parent.** Tag assignment, note creation, and attachment upload are safe at the database level, not merely at the service level.

Residual service-layer checks that the schema cannot express, all mandatory:

- Soft deletes are filtered by the repository (`deleted_at IS NULL`), never by the database.
- Before assigning a tag, the service confirms the tag is not soft-deleted.
- `trades.strategy_id` is nulled by the service (not by a cascade) when a strategy is hard-deleted, inside one transaction, with an audit entry.
- Currency agreement between `trading_accounts.currency` and `instrument_specs.currency` is enforced by the service, because both columns are nullable-comparable only at write time.

### 5.6 Partial uniqueness

Rules that must hold only among non-deleted rows use **partial unique indexes**, not table constraints. PostgreSQL does not accept a `WHERE` clause on a `UNIQUE` table constraint; it must be an index:

```sql
-- INVALID, rejected by PostgreSQL:
--   CONSTRAINT uq_tags_name UNIQUE (user_id, lower(name)) WHERE deleted_at IS NULL;

-- VALID:
CREATE UNIQUE INDEX uq_tags_name
    ON tags (user_id, lower(name)) WHERE deleted_at IS NULL;
```

Every partial unique rule in `database-schema.md` is expressed this way. Drizzle must emit these as `uniqueIndex(...).on(...).where(...)` so generated SQL matches the documented DDL exactly.

---

## 6. Error handling and logging

- Errors are raised as typed application errors (`lib/errors.ts`) and rendered by one error middleware. Route handlers never format error responses.
- Every response carries `X-Request-Id`. The backend generates it, echoes an inbound `X-Request-Id` if present, and includes it in every log line for that request.
- Logging is structured JSON (`pino`) with levels `error`, `warn`, `info`, `debug`.
- **Never logged**: passwords, access tokens, refresh tokens, cookie values, full request bodies for auth endpoints. Token material is only ever logged as a SHA-256 prefix.
- Unhandled errors return `INTERNAL_ERROR` with a generic message; the detail goes to logs only.

---

## 7. Security requirements (binding, all phases)

Implemented incrementally but never deferred past the phase listed in `docs/phase-plan.md`:

1. **Passwords**: Argon2id, minimum 10 characters, checked against a breach list when a service is available. Never logged, never returned by any endpoint.

   **Cost parameters (recorded 2026-10-03).** §7.1 fixes the algorithm and the length minimum but not the cost. The OWASP Password Storage Cheat Sheet baseline that ADR-007 cites as its rationale is adopted: `memoryCost` 19,456 KiB (19 MiB), `timeCost` 2, `parallelism` 1, `argon2id`. These are declared once in `backend/src/lib/password.ts` so a future change is a single edit.

   **Breach-list provider.** No external breach-list service is approved (ADR-012 defers external services) and offline development has none. `backend/src/lib/password.ts` therefore exposes a `PasswordBreachChecker` interface with a permissive default, so a provider can be wired later without touching call sites — the same seam the phase plan mandates for email transport.
2. **Access token**: short-lived JWT (15 min), signed with `JWT_ACCESS_SECRET`, claims `sub`, `sid`, `role`, `iat`, `exp`, `jti`. Delivered in `http_at` cookie, `httpOnly`, `secure` in production, `sameSite=lax`, `path=/api`.
3. **Refresh token**: opaque 256-bit random string. Only its SHA-256 hash is stored. Delivered in `http_rt` cookie, `httpOnly`, `secure` in production, `sameSite=strict`, `path=/api/v1/auth`. Lifetime 30 days.
4. **Refresh rotation with reuse detection**: each refresh issues a new token in the same `family_id` and marks the old one rotated. Presenting an already-rotated or revoked token revokes the entire family and returns `TOKEN_REUSE_DETECTED`, forcing a fresh login.
5. **CSRF** (required because cookies are used): double-submit token. `csrf_token` cookie is readable by JavaScript; every state-changing request must echo it in the `X-CSRF-Token` header. Enforced for `POST`, `PUT`, `PATCH`, `DELETE`. The token is issued by the unauthenticated bootstrap `GET /auth/csrf`, because every path that would otherwise set it is itself state-changing and therefore guarded (see `api-spec.md` §2.2.1).
6. **CORS**: explicit origin allowlist from `CORS_ORIGINS`. No wildcard. Credentials enabled.
7. **Input validation**: every request body, query parameter and route parameter is parsed by a Zod schema before reaching a service. Unknown keys are rejected.
8. **SQL injection**: all database access goes through Drizzle with bound parameters. String interpolation into SQL is prohibited and reviewed in every diff.
9. **Rate limiting**: per-IP **and** per-user on `auth` endpoints — login 10/15min on both dimensions, register 5/hour per IP, forgot-password 3/hour, reset-password 5/hour — and a global limiter (300/min). The auth limiters are applied in pairs, one per dimension, because a single-dimension key satisfies neither requirement on its own.
10. **Security headers**: `helmet` defaults, plus `Cache-Control: no-store` on all authenticated API responses.
11. **Uploads**: MIME allowlist (`image/png`, `image/jpeg`, `image/webp`), magic-byte verification, max 10 MB, filenames never used as storage keys, images re-encoded before serving.
12. **Secrets**: environment variables only, validated at startup. Startup fails if a required variable is missing. No secret is committed; `.env` is git-ignored; `.env.example` lists names with empty values.
13. **Audit log**: written for login, logout, password change, account creation/update, trade create/update/delete, attachment upload/delete.
14. **Authorization**: every endpoint resolves the target resource with `WHERE id = $1 AND user_id = $2`. Returning `404` instead of `403` when the caller does not own the resource prevents ID enumeration.

### 7.1 Bearer authentication: test-only

Bearer tokens exist **solely for automated tests**. Browsers in all environments (development, production) authenticate with cookies only.

| Environment | `Authorization: Bearer` | CSRF required | Enforced by |
| --- | --- | --- | --- |
| `test` | accepted | no | auth middleware |
| `development` | **rejected** with `401 UNAUTHENTICATED` | yes | auth middleware |
| `production` | **rejected** with `401 UNAUTHENTICATED` | yes | auth middleware |

This asymmetry is intentional and is the one place where test convenience is traded against production safety.

The test path is gated at startup, not by a runtime flag:

- A separate `tests/api/` Supertest harness builds the Express app with an explicit `authMode: 'bearer'` option.
- When `authMode: 'bearer'` is requested while `NODE_ENV === 'production'`, the app **refuses to construct** and throws at boot. There is no code path that reaches a production listener.
- The bearer path additionally requires an env var `ALLOW_TEST_BEARER=true`, which `.env.example` ships empty and which production configuration never sets.
- The CSRF middleware reads the same mode: it enforces double-submit in cookie and production modes, and skips only in bearer mode.
- A unit test asserts that a production-mode app returns `401` for a valid bearer token, so this cannot silently regress.

Result: CSRF cannot be bypassed in production, because in production both bearer auth and the CSRF skip are unavailable.

### 7.2 Cookie behaviour per environment

| | `http_at` / `http_rt` / `csrf_token` | SameSite | `secure` | `domain` |
| --- | --- | --- | --- | --- |
| Local dev (ports 5173 → 3000) | all three set | `lax` | `false` | host-only |
| Production, same-origin | all three set | `strict` | `true` | host-only |
| Production, split origins | all three set | `strict` | `true` | set to the shared parent domain |

Rules:

- **`domain` is never set to a public suffix and cookies are never shared across unrelated sites.** The parent-domain form is used only when the API is on a sibling subdomain and the owner has confirmed it is required.
- **Development relaxation is explicit.** `secure: false` in development is driven by `COOKIE_SECURE=false` in `.env`; the default is `true`. SameSite is `lax` in development so the Vite dev server on a different port can still receive the cookies.
- **Production is same-origin by design, and the owner has approved it (2026-10-03).** The built frontend and the API are served from one public origin, with the API mounted under `/api/v1` on that same origin. This makes `SameSite=strict` safe and removes CORS from the equation entirely. Recorded in `docs/README.md`, "Recorded owner decisions".
- **Split origins are not the chosen topology.** Had the owner chosen them (for example frontend on `app.example.com`, API on `api.example.com`), SameSite would have to be `none` with `secure: true` for cross-site cookies to work, and the CSRF double-submit token would become load-bearing rather than defence-in-depth. That would be a recorded deviation from the table above and would require a fresh explicit owner decision.
- CORS `credentials: true` is set only for allowlisted origins, and `CORS_ORIGINS` in production contains the exact frontend origin(s). Wildcards are rejected at startup.
- `http_rt` is scoped to `path=/api/v1/auth` so it is not attached to every API call, and the frontend must never read it.

### 7.3 Refresh token lifecycle (canonical)

| Property | Value | Source |
| --- | --- | --- |
| **Type** | Opaque 256-bit random string (not a JWT) | ADR-006, `refresh_tokens.token_hash` |
| **Storage** | SHA-256 hash only (`token_hash`), never the raw token | `database-schema.md` §3.3 |
| **Transport** | `http_rt` cookie, `httpOnly`, `secure` (prod), `sameSite=strict`, `path=/api/v1/auth` | §7.2 |
| **Lifetime** | 30 days (`expires_at = issued_at + 30 days`) | `refresh_tokens.expires_at` |
| **Rotation** | On every `/auth/refresh`: issue new token in same `family_id`, mark old `rotated_at` | §3.3 |
| **Reuse detection** | Presenting a rotated/revoked token → revoke entire `family_id`, return `TOKEN_REUSE_DETECTED` | §3.3 |
| **Revocation reasons** | `logout`, `rotation`, `reuse_detected`, `password_change`, `admin` | `token_revoked_reason` enum |
| **Family revocation** | `POST /auth/logout` revokes presented family; `POST /auth/logout-all` revokes all families for user; password change revokes all families | §2.3 |
| **Cookie scope** | `http_rt` only sent to `/api/v1/auth/*`; `http_at` sent to `/api/*` | §7.2 |
| **Test mode** | In `NODE_ENV=test`, access token sent as `Authorization: Bearer`; refresh still uses `http_rt` cookie | §7.1 |

The refresh token is **never** sent in response bodies, headers (except `Set-Cookie`), or logs. Token material is only ever logged as a SHA-256 prefix.

---

## 8. Frontend engineering rules

- Feature folders mirror backend modules.
- Server state lives in one cache layer (`lib/api`). No component-local `useEffect` fetching.
- All monetary values are formatted by one utility. Components never call `toFixed` on a raw API string.
- Design tokens are the only source of colour, spacing and typography. The authoritative token table is `docs/phase-plan.md`, Phase 2, "Design token system". No inline hex, `rgb()` or `hsl()` values in components, and no component defines its own foreground colour: `text` and `text-muted` exist for that.
- Every text-on-surface pairing must clear WCAG 2.1 AA at rest — 4.5:1 for body text, 3:1 for the edge of an interactive control. Text is never made readable only on hover. Interactive controls use `border-strong`; `border` is reserved for decorative edges such as card outlines and row dividers.
- Tailwind colour-alpha modifiers (`bg-accent/10`, `text-black/70`) must not be applied to token colours. The tokens are `var()` references, and Tailwind 3.4 discards the alpha and emits no rule at all, so the tint silently disappears. Every tint is an explicit `*-soft` token.
- Positive and negative never carry meaning alone. Every P&L figure is paired with a sign, glyph or word.
- No component exceeds a reasonable responsibility boundary: containers fetch and compose, presentational components render and emit events.
- Every user-visible money or percentage figure is rendered through the formatter that knows the account currency.

---

## 9. Testing philosophy (binding)

OpenCode may not report "implemented successfully". Every phase must produce this evidence chain:

```
Implementation
      ↓
Unit tests        (pure logic: money, R, drawdown, sessions, risk calculator)
      ↓
API tests          (Supertest: happy path, validation, authz, ownership)
      ↓
Frontend tests     (React Testing Library: critical flows and states)
      ↓
TypeScript check   (tsc --noEmit, both workspaces, zero errors)
      ↓
Lint               (ESLint + Prettier check, zero errors)
      ↓
Production build   (vite build + backend tsc emit, zero errors)
      ↓
Manual test checklist (written per phase, executed by the owner)
      ↓
git diff review
      ↓
Commit
```

Rules:

- Test file names mirror source: `trades.service.ts` → `trades.service.test.ts`.
- No test asserts on the absence of implementation details; assert on observable behaviour.
- Every bug fix must arrive with a regression test.
- Coverage is not a target. Critical paths (auth, ownership, money math, analytics formulas) are 100% test-covered; the rest is judgement.

---

## 10. Definition of Done (per phase)

A phase is complete only when all of the following are true:

1. Every deliverable in `docs/phase-plan.md` for that phase exists.
2. Migrations are committed as SQL and apply cleanly to an empty database.
3. Unit + API + frontend tests pass; new code has tests.
4. `tsc --noEmit` and lint are clean.
5. Production build succeeds.
6. `git diff` was reviewed; no unrelated changes, no debug statements, no commented-out code.
7. A manual test checklist was delivered and executed by the owner.
8. Nothing was committed unless the owner explicitly asked.

---

## 11. Change control

- Changing this document, the schema, or the API contract requires the owner's explicit instruction, and the change is recorded in the relevant document's revision history.
- Adding a runtime dependency requires a written justification in the phase notes. "It's small" is not justification.
- Renaming or removing a shipped API field is a breaking change and requires `/api/v2`.

---

## 12. Revision history

| Date | Phase | Change |
| --- | --- | --- |
| Phase 0 | 0 | Initial engineering contract locked |
| Phase 0.1 | 0.1 | PostgreSQL 18 local target; canonical session derivation; ownership integrity with composite FKs; partial unique indexes; no-FX currency rule; bearer=test-only; cookie topology per env; refresh token lifecycle table; test DB env vars; db:rollback safety |
| Phase 1 | 1 | Owner decision recorded in §5.3: the 05:00–07:00 UTC period is `tokyo`, because it lies inside Tokyo's defined window (00:00–09:00 UTC). The previous consequence bullet incorrectly claimed the period fell in no window and assigned it to `sydney`. Session windows and the precedence order are unchanged; `backend/src/lib/time.ts` already implemented this rule and was not modified |
| Phase 2 | 2 | ADR-014: design direction changed from dark-and-gold to light-and-purple at the owner's explicit instruction. §8 now points at the Phase 2 token table instead of Blueprint §18, and adds the WCAG AA contrast rule, the interactive-vs-decorative border rule, the prohibition on Tailwind colour-alpha modifiers over token colours, and the colour-is-never-alone rule for P&L. Database schema, API contract, security requirements, architecture and testing gates are unchanged |
| Phase 3 | 3 | Owner decision recorded in §7.2 on 2026-10-03: production hosting is **same-origin**, with the API under `/api/v1` on the same public origin. This confirms the topology §7.2 already specified as the design rather than changing it — the cookie table, `SameSite=strict`, `secure`, host-only `domain` and CSRF double-submit are all unchanged, and the split-origins bullet is reframed as the option that was not taken. Local development is untouched and stays cross-origin (`5173` → `3000`, `SameSite=lax`). No security requirement, schema or API change |
| Phase 3 | 3 | Resolved five Phase 3 conflicts at owner instruction: (1) refresh tokens are **opaque** per §7.3 and ADR-006 — the JWT refresh signing that contradicted this was removed; `JWT_REFRESH_SECRET` is retained in the env contract but no longer signs anything. (2) `api-spec.md` §2.1 is now environment-scoped and agrees with §7.2 (`strict` in production, `lax` in development). (3) §7.9 rate limits now state both dimensions and the api-spec split (forgot-password 3/hour, reset-password 5/hour). (4) Argon2id cost parameters recorded as the OWASP baseline. (5) The breach-list check is an interface seam with a permissive default. §7.1, §7.3 and ADR-007/ADR-006 are otherwise unchanged |
| Phase 3 | 3 | **New endpoint `GET /auth/csrf`, decided by the owner on 2026-10-03.** Cookie mode had no documented way to obtain the first CSRF token: `csrf_token` was set only by register, login and refresh, all of which are state-changing and therefore guarded by §7.5, so a fresh browser could never satisfy the double-submit rule. The bootstrap is `GET`, so it is not itself guarded, and it is unauthenticated because the token carries no authority and the response contains no user data. Rate limit 60/minute per IP to stop it serving as a token oracle. §7.5 item 5 and `api-spec.md` §2.2.1, §3 and §9.2 record it. No change to the CSRF rule itself, to any cookie attribute, or to any security requirement |