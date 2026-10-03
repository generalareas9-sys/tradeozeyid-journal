# TradeOzeyid â€” Phase Plan

Status: **LOCKED for Phase 1**
Last updated: Phase 1 (G5 manual verification recorded)

Each phase lists deliverables, migrations, and the verification gate. A phase is not complete until its gate passes and the owner has run the manual checklist.

Gate legend â€” all five are mandatory for every phase:

```
G1  tests pass          unit + api + frontend
G2  tsc --noEmit        zero errors, both workspaces
G3  lint                zero errors
G4  production build    zero errors
G5  manual checklist    owner-executed, results reported back
```

---

## Phase 1 â€” Project foundation

**Goal**: an empty but fully wired repository where the frontend and backend run, talk to the local PostgreSQL 18 instance, and all migrations apply cleanly.

Deliverables:

- npm workspaces root: `frontend/`, `backend/`, `packages/contracts/`
- `git init`, `.gitignore`, `.env.example` (exact contents listed in `docs/README.md`)
- Backend: Express app, `GET /api/v1/health` (with a real `SELECT 1`), pino logger, `X-Request-Id`, helmet, CORS allowlist, error middleware, graceful shutdown
- Backend: config module that validates env at startup and exits non-zero when a required variable is missing
- Drizzle wired to `DATABASE_URL`; migration runner script; `npm run db:migrate`, `db:rollback`, `db:generate`
- Frontend: Vite + React + TS + Tailwind, renders a shell that calls `/health` and shows status
- `packages/contracts`: shared types for the health response, to prove the workspace sharing works
- Vitest configured in both workspaces; Supertest wired to the backend app instance

**Phase 1 provisioning checklist (owner runs these before code starts)**

- [ ] Confirm `postgresql-x64-18` is running (`Get-Service postgresql-x64-18`)
- [ ] Confirm `pg_isready -h 127.0.0.1 -p 5432` reports `accepting connections`
- [ ] Confirm the `psql` bin directory is on `PATH`, or invoke it by full path (`C:\Program Files\PostgreSQL\18\bin\psql.exe`)
- [ ] Create the application role and databases (`tradeozeyid`, `tradeozeyid_test`) with `scram-sha-256` passwords
- [ ] Put the connection strings in `.env` as `DATABASE_URL` (dev) and `DATABASE_URL_TEST` (test); never commit them
- [ ] Confirm the test database exists so migrations can be verified against an empty database (mandatory for the verification gate)
- [ ] Verify test runner config uses `DATABASE_URL_TEST` and rejects startup if missing

Migrations: **0001 through 0013 are all applied in Phase 1** when `npm run db:migrate` runs against an empty database. The verification gate requires this: the test database is created fresh and the full migration sequence applies in one pass.

> **Note:** Phase 1 runs *all* migrations. Phases 3â€“12 deliver endpoints and UI that use these tables; they do **not** create new migrations. The migration files are all committed in the repository before Phase 1 completes, so the schema is stable and verifiable from the start.

Gate: G1â€“G5. Manual: health endpoint returns `200` in the browser and via curl; frontend shows "API reachable".

#### G5 manual verification — owner-executed 2026-10-02

G5 is defined in the gate legend above as `manual checklist    owner-executed, results reported back`. The owner executed the three manual checks below on **2026-10-02** and confirmed each result first-hand. **G5: satisfied.**

| # | Check | Command / URL | Owner-reported result | Status |
| --- | --- | --- | --- | --- |
| 1 | Application starts | `npm run dev` | Backend started on port `3000`; frontend started at `http://localhost:5173/`; both services ran successfully | **VERIFIED (owner)** |
| 2 | Health endpoint answers over HTTP | `Invoke-RestMethod -Uri http://localhost:3000/api/v1/health` | `status: ok`, `database: ok`, `version: 0.1.0`; the response included a request id | **VERIFIED (owner)** |
| 3 | Frontend reports the API in the browser | `http://localhost:5173/` | Page showed "API reachable" with `status: ok`, `database: ok`, `version: 0.1.0`, `uptime: 481s` | **VERIFIED (owner)** |

Check 2 exercises the `SELECT 1` round trip and check 3 exercises the same request through the Vite dev proxy, so together they cover both routes named in the Phase 1 gate line: "in the browser and via curl".

Gate status for Phase 1: **G1–G5 satisfied.** G1–G4 are reproducible on demand with `npm run test`, `npm run typecheck`, `npm run lint` and `npm run build`. G5 is not reproducible by an agent; it rests solely on the owner's confirmation recorded in the table above.

---

## Phase 2 â€” Design system + application shell

**Goal**: the professional dark workspace shell exists and every screen will be built inside it.

Deliverables:

- Design tokens from Blueprint Â§18 as CSS custom properties + Tailwind theme: `#0B0D0F`, `#13171B`, `#181D22`, `#272D33`, `#D6A84F`, `#3FB67A`, `#D65C5C`
- Typography: Inter (UI) + IBM Plex Mono (all numerals, prices, R multiples)
- Core primitives: `Button`, `Input`, `Select`, `DatePicker`, `Dialog`, `Table`, `Card`, `Badge`, `Tabs`, `Toast`, `Skeleton`, `EmptyState`, `StatTile`
- Money and percent formatters that accept decimal strings and a currency code
- App shell: sidebar navigation, top bar with account selector placeholder, responsive layout
- Route skeleton for every MVP area with placeholder pages
- Money colour rule: positive/negative always paired with a sign or label, never colour alone (accessibility)

Gate: G1â€“G5. Manual: shell renders at 1440px and 390px; primitives reviewed visually.

---

## Phase 3 â€” Authentication + users

**Goal**: a real, secure session.

Deliverables:

- Argon2id password hashing with a shared config
- `POST /auth/register`, `login`, `refresh`, `logout`, `logout-all`, `forgot-password`, `reset-password`, `change-password`, `GET /auth/me`
- Refresh rotation with reuse detection and family revocation
- httpOnly cookies + CSRF double-submit middleware
- Rate limiting on all auth endpoints
- `GET/PATCH /users/me`
- Audit log writes for register, login, logout, password change
- Frontend: login, register, forgot/reset password, protected route wrapper, auth context, silent-refresh interceptor
- Email delivery: console transport in development behind an interface, so Phase 16 can swap in a real provider without touching call sites

Tests: unit (argon2 params, token hashing, rotation state machine), API (full flow, reuse detection, CSRF failure, rate limit, cross-user isolation, validation).

Gate: G1â€“G5. Manual: register â†’ login â†’ refresh survives â†’ logout â†’ protected route blocked.

---

## Phase 4 â€” Trading accounts

Deliverables:

- Migration 0006
- Full CRUD, archive, set-default, soft delete with conflict rules
- Computed `currentBalance` and `tradeCount`
- First account becomes default; only one default per user (enforced by index)
- Frontend: account list, create/edit dialog, archive, default switcher in the top bar

Tests: API tests including ownership isolation, duplicate-name conflict, and `startingBalance` immutability once trades exist.

Gate: G1â€“G5.

---

## Phase 5 â€” Trade journal core

**Goal**: record a trade correctly and see it back.

Deliverables:

- Migrations **0007** (`strategies`, `strategy_rules`), **0008** (`tags`), **0009** (`trades`) â€” strategies and tags are created here so `trades` can reference them; they are dormant until Phase 7 activates their UI
- `GET/POST /trades`, `GET/PATCH/DELETE /trades/:id`, `close`, `reopen`, `cancel`
- Server-side `session` derivation from UTC clock time (engineering-contract.md Â§5.3), `plannedRisk = |entryâˆ’SL| Ã— quantity Ã— contractSize`, `pnl` and `rMultiple` per database-schema.md Â§5
- Full filter object, cursor pagination, sorting
- Per-status patch restrictions
- Frontend: trades table (all columns from Blueprint Â§10), trade form with validation, close-trade dialog, filters bar, Day View and Week View

Tests: unit tests for every formula in `database-schema.md` Â§5 including the exact stop-loss-out `rMultiple = -1.0000` invariant; API tests for side checks, status transitions, and filters.

Gate: G1â€“G5.

---

## Phase 6 â€” Trade detail, executions, notes, attachments

Deliverables:

- Migration 0010 (`trade_tags`, `trade_executions`, `trade_notes`, `trade_attachments`)
- Trade detail page: information â†’ executions â†’ risk â†’ strategy â†’ tags â†’ screenshots â†’ notes â†’ review (Blueprint Â§10)
- Executions with server-side aggregate recomputation (weighted average)
- Notes CRUD, soft delete
- Attachments: multipart upload, MIME allowlist, magic-byte check, 10 MB limit, re-encode, signed short-lived URLs, authorized streaming
- Local disk storage adapter behind an interface so an object-storage provider can be swapped in later

Tests: API tests for upload rejection paths (wrong MIME, corrupt file, oversized), authorization on attachment reads, and recomputation correctness across partial fills.

Gate: G1â€“G5.

---

## Phase 7 â€” Strategies + tags

Deliverables:

- No new migrations â€” `strategies` (0007), `strategy_rules` (0007), `tags` (0008), `trade_tags` (0010) are already in the schema
- Strategy CRUD with rules CRUD and gapless transactional reorder
- Tag CRUD with category
- `PUT/DELETE /trades/:id/tags` with ownership validation
- Frontend: strategy list and editor with drag-free ordered checklist, tag manager, tag picker on trades
- Case-insensitive uniqueness returning `409`

Gate: G1â€“G5.

---

## Phase 8 â€” Dashboard

Deliverables:

- `GET /dashboard` single round trip: metrics, equity curve, drawdown, calendar, recent trades, by-session
- Equity curve seeded with `startingBalance`
- Calendar heatmap
- Drawdown card
- Global filter state lives in the URL so a filtered dashboard is shareable and survives reload
- Frontend: dashboard page per Blueprint Â§9

Tests: unit tests for drawdown (including peak/trough/recovered detection), calendar bucketing in a non-UTC timezone, and profit-factor null cases.

Gate: G1â€“G5.

---

## Phase 9 â€” Analytics engine

**Goal**: reliable calculations, not 300 reports.

Deliverables:

- `/analytics/summary`, `equity-curve`, `drawdown`, `breakdown`, `calendar`, `streaks`
- Dimensions: day, week, month, dayOfWeek, timeOfDay, strategy, symbol, session, direction, tag, riskBucket, emotion
- `bucket` aggregation for the equity curve
- Strategy `stats` populated on the strategy resource
- One implementation of each formula in `backend/src/analytics/`, reused by the trade service and the dashboard
- Frontend: performance, strategies, sessions, symbol, direction analytics views

Tests: every metric gets unit tests against hand-computed fixtures; analytics endpoints get API tests verifying that filters change results and that ownership scoping holds.

Gate: G1â€“G5.

---

## Phase 10 â€” Risk calculator integration

**Goal**: the proven GoldRisk logic, preserved, in the product.

Deliverables:

- Migration **0011** (`instrument_specs`), seeded with Exness Standard Cent `XAUUSDc` (contract size **1**, lot step 0.01)
- `POST /risk/calculate` implementing `database-schema.md` Â§5.3
- `exactLot`, `recommendedLot` floored to `lotStep`, clamped to bounds, with warnings
- Risk presets
- Frontend: calculator tool with the account context prefilled
- Trade form reuses the calculator so the trader never re-enters a lot size

Tests: unit tests ported from the existing GoldRisk engine, plus edge cases (floor changes risk > 5%, min/max clamping, wrong-side SL).

Gate: G1â€“G5. Manual: recompute a known real trade and compare lot size to GoldRisk.

---

## Phase 11 â€” Psychology + daily journal

Deliverables:

- Migrations **0012–0013** (`journal_entries`, `journal_emotions`, `reviews`, `trade_reviews`)
- `GET/PUT /trades/:id/review`
- Journal entries, emotions, reviews
- `word_count` computed server-side; one entry per user per date
- New filter params: `brokeRules`, `emotionTagId`
- New analytics dimensions: `emotion`, plus emotion Ã— result reporting
- Frontend: daily journal editor, psychology form on trade detail, daily/weekly review pages, psychology reports

Gate: G1â€“G5.

---

## Phase 12 â€” Reports + advanced filtering

Deliverables:

- `POST /analytics/trades/export` CSV with a configurable column set
- Filter persistence, saved filter presets, shareable filter URLs
- Report pages: performance, risk, strategies, sessions, calendar, symbol, direction, tag
- Print-friendly report layout

Gate: G1â€“G5.

---

## Phase 13â€“17 (planned, specified per phase)

| Phase | Scope |
| --- | --- |
| 13 Replay | `market_data`, `replay_sessions`, `replay_decisions`, progressive charting |
| 14 Backtesting | `backtest_sessions`, `backtest_rules`, `backtest_trades`, rule engine; strictly separate from live stats |
| 15 Exness/import | `imports`, `import_rows`, `import_mappings`, background processing |
| 16 AI | Analysis over the trader's own data only; provider choice deferred to the phase |
| 17 Production | Full security review, rate limiting, indexing pass, query plans, backups, deployment, monitoring |

**Progress area (blueprint product map):** `progress_checkpoints`, `progress_metrics` are reserved but **not assigned to any phase in 1â€“17**. Phase 8 is Dashboard. Assigning these to a specific phase would invent a product requirement; see "Unresolved owner decisions" in `docs/README.md`.

Each of these starts with a spec document added to `docs/` before any code is written, exactly as Phase 0 did.

---

## Verification reporting template

OpenCode's final message for each phase uses this structure:

```
Phase N â€” <name>

Implemented
  - <file paths and what they do>

Migrations
  - <migration files>; applied cleanly to empty DB: yes/no

Verification
  - unit tests:     <n> passed
  - api tests:      <n> passed
  - frontend tests: <n> passed
  - tsc --noEmit:   clean / <errors>
  - lint:           clean / <errors>
  - build:          success / <errors>
  - git status:     <files changed>

Manual checklist (owner runs these)
  1. ...

Anything questionable
  - <deviations, assumptions, known gaps>
```

If any line is missing, the phase is not reported as complete.

---

## Revision history

| Date | Phase | Change |
| --- | --- | --- |
| Phase 0 | 0 | Initial phase plan locked |
| Phase 0.1 | 0.1 | Phase 1 provisioning checklist; migrations 0003â€“0005 applied in Phase 1 only; migration 0011 (instrument_specs) for Phase 10; migrations 0012â€“0013 for Phase 11; test DB env vars; db:rollback definition; health endpoint alignment |
| Phase 1 | 1 | Recorded the owner-executed G5 manual verification for Phase 1, dated 2026-10-02: all three checks (`npm run dev`, `Invoke-RestMethod http://localhost:3000/api/v1/health`, and the browser view at `http://localhost:5173/`) confirmed by the owner. Documentation-only: no deliverable, migration, gate definition or checklist requirement was altered |
