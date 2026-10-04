# TradeOzeyid — Documents

Authoritative specification for TradeOzeyid. Read in this order.

| Document | Contents |
| --- | --- |
| [`engineering-contract.md`](./engineering-contract.md) | Locked decisions, repository layout, naming, data/time/money conventions, security requirements, testing philosophy, definition of done |
| [`database-schema.md`](./database-schema.md) | Every table, enum, constraint, and index as exact DDL; canonical formulas; migration order; reserved tables |
| [`api-spec.md`](./api-spec.md) | Envelopes, serialization, error codes, the shared filter object, pagination, every endpoint with bodies and responses |
| [`phase-plan.md`](./phase-plan.md) | Phase 1–12 deliverables, migrations per phase, and the mandatory verification gate |

Operating rules for OpenCode live in [`../AGENTS.md`](../AGENTS.md).

## Status

Phases 0, 0.1, 1 and 2 are complete. Phase 1 G1–G5 were verified by the owner on 2026-10-02. Phase 2 — design system and application shell — was verified G1–G5 on 2026-10-03, including the desktop Dashboard, the 390px mobile layout, the mobile navigation drawer, and the visual review of every UI primitive against the light-and-purple token system.

**Next action: Phase 3 — Authentication + users** (`phase-plan.md`). Its precondition is cleared: the owner approved **same-origin production hosting** on 2026-10-03, recorded under "Recorded owner decisions" below. Phase 3 creates no migrations: 0001–0013 already exist from Phase 1.

The variable names for the environment are fixed by the contract:

```
NODE_ENV
PORT
DATABASE_URL
DATABASE_URL_TEST
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
ACCESS_TOKEN_TTL
REFRESH_TOKEN_TTL
COOKIE_SECURE
ALLOW_TEST_BEARER
CORS_ORIGINS
LOG_LEVEL
STORAGE_DIR
```

`DATABASE_URL_TEST` is **only required in the `test` environment**. The test runner must set it; the application validates its presence when `NODE_ENV=test`.

`ALLOW_TEST_BEARER` unlocks the test-only bearer authentication path of §7.1 and defaults to `false`. `.env.example` ships it **empty** so development and production never enable it; only the API test suite sets it to `true`.

## Locked decisions summary

React + TypeScript + Vite + Tailwind · Node + Express + TypeScript · **PostgreSQL 18 (local)** · Drizzle ORM · JWT access + rotating refresh in httpOnly cookies with CSRF double-submit · Argon2id · Vitest + Supertest + React Testing Library · npm workspaces · no Redis/BullMQ in the MVP · **light-and-purple UI with a violet accent** (ADR-014; token table in [`phase-plan.md`](./phase-plan.md), Phase 2).

## Recorded owner decisions

Decisions the owner has made that are not derivable from the contract text alone. Each is binding on implementation.

1. **Production cookie topology — same-origin hosting. Decided 2026-10-03.**

   The built frontend and the API are served under **one public origin**. The API is mounted under `/api/v1` on that same origin, so no cross-origin request occurs between them.

   Consequences, all of which follow from `engineering-contract.md` §7.2 rather than adding to it:

   - `SameSite=strict` is safe in production, because there is no cross-site context to protect against.
   - `secure: true` and `httpOnly` for `http_at`, `http_rt` and `csrf_token`; `domain` stays host-only.
   - CORS is not exercised in production. The §7.6 startup validation, origin allowlist and `credentials: true` remain in force unchanged.
   - **The authentication design is unchanged:** httpOnly cookies, `SameSite=Strict`, and CSRF double-submit protection. Double-submit stays as defence-in-depth; it does not become load-bearing.
   - `http_rt` remains scoped to `path=/api/v1/auth`.

   Split origins (`app.example.com` + `api.example.com`) are **not** the chosen topology. If they are ever revisited, `engineering-contract.md` §7.2 requires `SameSite=none` with `secure: true`, promotes the CSRF token to load-bearing, and demands an explicit recorded deviation.

   Local **development is unaffected and remains cross-origin**: the Vite dev server on `5173` talks to the API on `3000`, which is a different origin, so development keeps `SameSite=lax` and `COOKIE_SECURE=false` per the §7.2 table.

2. **CSRF bootstrap endpoint `GET /auth/csrf`. Decided 2026-10-03.**

   Cookie mode could not obtain its first CSRF token. `csrf_token` was set only by register, login and refresh, and all three are unsafe methods that §7.5 already guards, so a fresh browser could never satisfy the double-submit rule and `/login` was unreachable in the real app. The owner chose a **dedicated unauthenticated bootstrap endpoint** over the alternatives (reusing `GET /auth/me`, or exempting the anonymous auth endpoints).

   Consequences:

   - The endpoint is `GET`, so §2.2 does not guard it — that is precisely what makes it able to bootstrap.
   - It is unauthenticated because the token authorises nothing on its own (§2.1) and the response carries no user data.
   - Rate limit 60/minute per IP, to stop it being driven as a token oracle.
   - The frontend calls it **lazily**, before the first unsafe request, so a visitor who only reads never spends the request.
   - The CSRF rule itself, every cookie attribute and every other security requirement are unchanged.

3. **Session-probe failure resolves to `anonymous`. Decided 2026-10-03.**

   When `GET /auth/me` fails on network error or 5xx, `AuthProvider` sets `anonymous` rather than staying in `loading`. A dead network must not leave the shell spinning forever, and the protected-route gate already redirects an anonymous visitor to login. A distinct error state with a retry affordance would be better on a flaky connection, and is a separate deliberate change. The code comment previously described the opposite behaviour and has been corrected to match the code.

## Unresolved owner decisions

These are explicitly not decided in the contract and must not be assumed during implementation:

1. **Progress feature phase**: The blueprint includes a "Progress" product area but Phases 1–17 have no Progress phase. `progress_checkpoints` and `progress_metrics` are reserved without a phase number. Owner must assign or defer.
2. **Object storage provider for attachments**: Local disk in dev; production provider decision at Phase 6.
3. **Charting library**: Equity curve (Phase 8) and replay (Phase 13). Undecided.
4. **AI provider and model**: Phase 16.
5. **Broker import adapters beyond Exness**: Phase 15.
6. **XAUUSDc maximum lot size**: The TradeOzeyid schema defaults `instrument_specs.max_lot = 100`. The existing GoldRisk engine may use a different maximum for Exness Standard Cent XAUUSDc. Owner must confirm the correct value before Phase 10 seeds the spec. Do not silently change either specification.

## Rules for changing these documents

Any change to the schema or the API contract requires the owner's explicit instruction and must be recorded in that document's revision history. Code that contradicts the documents is a bug, not an exception.