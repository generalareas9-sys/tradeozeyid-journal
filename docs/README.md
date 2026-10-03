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

Phase 0 is complete; Phase 0.1 correction pass applied. No application code exists yet.

**Next action: Phase 1 — Project foundation.**

Before Phase 1 the owner needs to **reuse the local PostgreSQL 18 instance** and create a `.env` from `.env.example`. The variable names are fixed by the contract:

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
CORS_ORIGINS
LOG_LEVEL
STORAGE_DIR
```

`DATABASE_URL_TEST` is **only required in the `test` environment**. The test runner must set it; the application validates its presence when `NODE_ENV=test`.

## Locked decisions summary

React + TypeScript + Vite + Tailwind · Node + Express + TypeScript · **PostgreSQL 18 (local)** · Drizzle ORM · JWT access + rotating refresh in httpOnly cookies with CSRF double-submit · Argon2id · Vitest + Supertest + React Testing Library · npm workspaces · no Redis/BullMQ in the MVP.

## Unresolved owner decisions

These are explicitly not decided in the contract and must not be assumed during implementation:

1. **Production cookie topology**: Same-origin (`app.example.com` + API under `/api/v1`) or split origins (`app.example.com` + `api.example.com`)? Same-origin is the default recommendation; split origins require SameSite=none + secure + CSRF as load-bearing defence. Decision must be recorded before Phase 3.
2. **Progress feature phase**: The blueprint includes a "Progress" product area but Phases 1–17 have no Progress phase. `progress_checkpoints` and `progress_metrics` are reserved without a phase number. Owner must assign or defer.
3. **Object storage provider for attachments**: Local disk in dev; production provider decision at Phase 6.
4. **Charting library**: Equity curve (Phase 8) and replay (Phase 13). Undecided.
5. **AI provider and model**: Phase 16.
6. **Broker import adapters beyond Exness**: Phase 15.
7. **XAUUSDc maximum lot size**: The TradeOzeyid schema defaults `instrument_specs.max_lot = 100`. The existing GoldRisk engine may use a different maximum for Exness Standard Cent XAUUSDc. Owner must confirm the correct value before Phase 10 seeds the spec. Do not silently change either specification.

## Rules for changing these documents

Any change to the schema or the API contract requires the owner's explicit instruction and must be recorded in that document's revision history. Code that contradicts the documents is a bug, not an exception.