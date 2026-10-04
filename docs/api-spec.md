# TradeOzeyid â€” API Specification (exact)

Status: **LOCKED for Phase 1**
Last updated: Phase 0.1 (correction pass)
Base URL: `https://<host>/api/v1` (development: `http://localhost:3000/api/v1`)
Companion documents: `engineering-contract.md`, `database-schema.md`

---

## Table of contents

1. [Global rules](#1-global-rules)
2. [Authentication](#2-authentication)
3. [Endpoint index](#3-endpoint-index)
4. [Serialization rules](#4-serialization-rules)
5. [Errors](#5-errors)
6. [Filtering](#6-filtering)
7. [Pagination and sorting](#7-pagination-and-sorting)
8. [Resources](#8-resources)
9. [Endpoints](#9-endpoints)
10. [Phase mapping](#10-phase-mapping)
11. [Revision history](#11-revision-history)

---

## 1. Global rules

| Rule | Value |
| --- | --- |
| Protocol | HTTPS only in production |
| Content type | `application/json; charset=utf-8` for requests and responses, except file upload (`multipart/form-data`) |
| Versioning | URL path `/api/v1`. Breaking changes require `/api/v2`. |
| Authentication | Cookie session (access + refresh), CSRF double-submit on mutations |
| Request id | Send or receive `X-Request-Id` (UUID). Echoed on every response. |
| Cache | `Cache-Control: no-store` on all authenticated responses |
| Time | ISO-8601 UTC with `Z`: `2026-09-30T14:22:05.123Z` |
| Dates | `YYYY-MM-DD` |
| Numerics | `numeric` columns are JSON **strings**, never JSON numbers (Â§4) |
| Enums | lowercase strings, exactly as in the database |
| Booleans | JSON `true` / `false`, never `"true"` / `1` |
| Unknown fields in request bodies | Rejected with `VALIDATION_ERROR` |
| Trailing slashes | Not accepted; `404` |
| Compression | Responses above 1 KB are gzipped |

### Success envelope

Single resource:

```json
{ "data": { } }
```

Collection:

```json
{
  "data": [ ],
  "meta": {
    "requestId": "0f9c...",
    "pagination": { "limit": 50, "nextCursor": "eyJ...", "hasMore": true }
  }
}
```

`meta` is always present on collections and always carries `requestId`.

---

## 2. Authentication

### 2.1 Cookies

Attributes are **environment-scoped**. The environment-scoped authority is `engineering-contract.md` §7.2; this table restates it for the API reader and must not diverge from it.

| Cookie | Contents | Path | Lifetime |
| --- | --- | --- | --- |
| `http_at` | JWT access token | `/api` | 15 min |
| `http_rt` | Opaque refresh token | `/api/v1/auth` | 30 days |
| `csrf_token` | Random CSRF token | `/` | 30 days |

| | `http_at` | `http_rt` | `csrf_token` |
| --- | --- | --- | --- |
| **Production (same-origin)** | `httpOnly`, `secure`, `SameSite=Strict` | `httpOnly`, `secure`, `SameSite=Strict` | `secure`, `SameSite=Strict`, **readable by JS** |
| **Local development** (cross-origin `5173` → `3000`) | `httpOnly`, `secure=false`, `SameSite=Lax` | `httpOnly`, `secure=false`, `SameSite=Lax` | `secure=false`, `SameSite=Lax`, **readable by JS** |

`domain` is never set in any environment (host-only). `csrf_token` is deliberately **not** `httpOnly`: §2.2 requires JavaScript to read it and echo it in `X-CSRF-Token`. It carries no authority on its own.

Production `secure` is always true. Development relaxes it only through an explicit `COOKIE_SECURE=false` in `.env`; the default is `true`.

### 2.2 CSRF

Every `POST`, `PUT`, `PATCH`, `DELETE` request must send:

```
X-CSRF-Token: <value of csrf_token cookie>
```

Failure returns `403 CSRF_FAILED`. Requests authenticated solely by an `Authorization: Bearer` header skip this check, which keeps API testing with Supertest straightforward.

The CSRF token is rotated on login and on refresh.

#### 2.2.1 Obtaining the first token

`GET /auth/csrf` is the bootstrap. It sets `csrf_token` and returns the same value in the body, so the client can echo it in `X-CSRF-Token`.

This endpoint exists because the token cannot be obtained any other way: the cookie is set only after register, login and refresh, and all three are themselves state-changing, so without a bootstrap a fresh browser could never satisfy §2.2. `GET /auth/csrf` is `GET`, so §2.2 does not guard it.

It is unauthenticated by design. The token grants no authority on its own — §2.1 notes it "carries no authority on its own", and it only ever satisfies the double-submit comparison — so there is nothing to protect and no user data in the response. Rate limit 60/minute per IP, to stop it being used as a token oracle.

The frontend HTTP client calls it lazily: immediately before the first unsafe request of a page load, and again only if the `csrf_token` cookie is absent. A visitor who only reads never triggers it. No speculative call is made on page load or on route change.

### 2.3 Session rules

- Access token lifetime: 15 minutes.
- Refresh token lifetime: 30 days, rotating on every use.
- Reuse of a rotated or revoked refresh token revokes the whole family and returns `401 TOKEN_REUSE_DETECTED`.
- `POST /auth/logout` revokes the presented family. `POST /auth/logout-all` revokes every family for the user.
- Password change revokes every family.
- `GET /auth/me` returning `401` is the frontend's signal to attempt one silent refresh, then redirect to login if that fails.

> **Canonical lifecycle**: See `engineering-contract.md` Â§7.3 for the authoritative refresh token lifecycle table (type, storage, transport, rotation, reuse detection, revocation reasons, cookie scope).

### 2.4 Bearer authentication is test-only

`Authorization: Bearer <access-token>` is accepted **only** in `NODE_ENV=test`. In `development` and `production` the backend rejects bearer tokens with `401 UNAUTHENTICATED` even when the token is cryptographically valid, because cookies are the only supported transport for browsers.

| Environment | Bearer accepted | CSRF double-submit required | How to enable |
| --- | --- | --- | --- |
| `test` | yes | no | Test harness constructs the app with `authMode: 'bearer'` |
| `development` | **no** | **yes** | n/a |
| `production` | **no** | **yes** | n/a |

Fail-closed guarantees, enforced in `app.ts` and covered by unit tests:

- Requesting `authMode: 'bearer'` while `NODE_ENV !== 'test'` **throws at construction time**. The server never starts.
- `authMode: 'bearer'` also requires `ALLOW_TEST_BEARER=true`, which `.env.example` ships empty and production/development never sets.
- The CSRF middleware reads the same `authMode`; the skip is unreachable when the app is in `cookie` mode.
- A test asserts a development-mode app returns `401` for a valid bearer token, so the rule cannot regress unnoticed.

Browsers always use cookies. See `engineering-contract.md` Â§7.1 and Â§7.2 for cookie attributes per environment.

---

## 3. Endpoint index

| Method | Path | Phase |
| --- | --- | --- |
| `GET` | `/api/v1/health` | 1 |
| `POST` | `/auth/register` | 3 |
| `POST` | `/auth/login` | 3 |
| `POST` | `/auth/refresh` | 3 |
| `POST` | `/auth/logout` | 3 |
| `POST` | `/auth/logout-all` | 3 |
| `GET` | `/auth/me` | 3 |
| `GET` | `/auth/csrf` | 3 |
| `POST` | `/auth/forgot-password` | 3 |
| `POST` | `/auth/reset-password` | 3 |
| `POST` | `/auth/change-password` | 3 |
| `GET`/`PATCH` | `/users/me` | 3 |
| `GET`/`POST` | `/trading-accounts` | 4 |
| `GET`/`PATCH`/`DELETE` | `/trading-accounts/:id` | 4 |
| `POST` | `/trading-accounts/:id/archive` | 4 |
| `POST` | `/trading-accounts/:id/set-default` | 4 |
| `GET` | `/trading-accounts/:id/summary` | 9 |
| `GET`/`POST` | `/trades` | 5 |
| `GET`/`PATCH`/`DELETE` | `/trades/:id` | 5 |
| `POST` | `/trades/:id/close` | 5 |
| `POST` | `/trades/:id/reopen` | 5 |
| `POST` | `/trades/:id/cancel` | 5 |
| `GET`/`POST` | `/trades/:id/executions` | 6 |
| `DELETE` | `/trades/:id/executions/:executionId` | 6 |
| `GET`/`POST` | `/trades/:id/notes` | 6 |
| `PATCH`/`DELETE` | `/trades/:id/notes/:noteId` | 6 |
| `GET`/`POST` | `/trades/:id/attachments` | 6 |
| `GET` | `/trades/:id/attachments/:attachmentId` | 6 |
| `DELETE` | `/trades/:id/attachments/:attachmentId` | 6 |
| `GET`/`PUT` | `/trades/:id/review` | 11 |
| `GET`/`PUT`/`DELETE` | `/trades/:id/tags` | 7 |
| `GET`/`POST` | `/strategies` | 7 |
| `GET`/`PATCH`/`DELETE` | `/strategies/:id` | 7 |
| `GET`/`POST` | `/strategies/:id/rules` | 7 |
| `PUT` | `/strategies/:id/rules/order` | 7 |
| `PATCH`/`DELETE` | `/strategies/:id/rules/:ruleId` | 7 |
| `GET`/`POST` | `/tags` | 7 |
| `PATCH`/`DELETE` | `/tags/:id` | 7 |
| `GET` | `/dashboard` | 8 |
| `GET` | `/analytics/summary` | 9 |
| `GET` | `/analytics/equity-curve` | 9 |
| `GET` | `/analytics/drawdown` | 9 |
| `GET` | `/analytics/breakdown` | 9 |
| `GET` | `/analytics/calendar` | 9 |
| `GET` | `/analytics/streaks` | 9 |
| `POST` | `/analytics/trades/export` | 12 |
| `POST` | `/risk/calculate` | 10 |
| `GET`/`POST` | `/risk/presets` | 10 |
| `PATCH`/`DELETE` | `/risk/presets/:id` | 10 |
| `GET`/`POST` | `/journal/entries` | 11 |
| `GET`/`PATCH`/`DELETE` | `/journal/entries/:id` | 11 |
| `GET`/`POST` | `/journal/entries/:id/emotions` | 11 |
| `DELETE` | `/journal/entries/:id/emotions/:emotionId` | 11 |
| `GET`/`POST` | `/reviews` | 11 |
| `PATCH`/`DELETE` | `/reviews/:id` | 11 |

Reserved, specified later: `/replay/*` (13), `/backtests/*` (14), `/imports/*` (15), `/ai/*` (16).

---

## 4. Serialization rules

**Numbers are strings.** Every `numeric` column is serialized as a decimal string:

```json
{ "entryPrice": "2415.3300000000", "pnl": "245.2000000000", "rMultiple": "2.4000" }
```

Integers and `numeric` fields that are conceptually counts (`totalTrades`, `position`, `wordCount`) are serialized as JSON numbers. Percentages (`winRate`, `riskPercent`) are serialized as numbers rounded to a documented precision, because they are display values, not money.

Money rendering, currency-aware formatting and colour are frontend concerns; the API returns raw values plus the account `currency`.

Nullable fields are `null`, never omitted, never `""`.

**Derived vs. stored fields.** Every field in a resource response is either:
- **Stored** â€” maps directly to a database column (or a join column)
- **Derived** â€” computed at read time from stored fields

Derived fields are documented in each resource's description. Examples:
- `TradingAccount.currentBalance` = `startingBalance` + Î£ closed trade `pnl`
- `TradingAccount.tradeCount` = count of non-deleted trades for the account
- `Trade.durationMinutes` = `exitTime` âˆ’ `entryTime` (null if open)
- `Strategy.tradeCount` = count of non-deleted trades using the strategy
- `Strategy.stats` = analytics aggregates (Phase 9+)
- `Tag.tradeCount` = count of non-deleted trade_tags for the tag
- `JournalEntry.tradeSummary` = aggregates of trades on that `entryDate`
- `TradeReview` fields are all stored (1:1 with `trade_reviews` table)

`createdAt` / `updatedAt` / `deletedAt` follow Â§1.

---

## 5. Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "entryPrice", "message": "Must be a decimal string" },
      { "path": "stopLoss", "message": "Must be below entryPrice for a long trade" }
    ]
  },
  "meta": { "requestId": "0f9c1f2e-7d0b-4a52-9c9f-1c2e3f4a5b6c" }
}
```

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body, query, or param failed schema validation |
| `INVALID_CREDENTIALS` | 401 | Login failed. Deliberately vague. |
| `UNAUTHENTICATED` | 401 | Missing or invalid access token |
| `TOKEN_EXPIRED` | 401 | Access token expired; client should refresh |
| `TOKEN_REUSE_DETECTED` | 401 | Refresh rotation violation; all sessions revoked |
| `CSRF_FAILED` | 403 | Missing or mismatched `X-CSRF-Token` |
| `FORBIDDEN` | 403 | Authenticated, but the action is not permitted |
| `NOT_FOUND` | 404 | Resource does not exist, is soft-deleted, or is not owned by the caller |
| `METHOD_NOT_ALLOWED` | 405 | Path exists, method does not |
| `CONFLICT` | 409 | Uniqueness violation (e.g. account name, journal date) |
| `PAYLOAD_TOO_LARGE` | 413 | Body or upload exceeds the limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Upload MIME type not allowed |
| `RATE_LIMITED` | 429 | Rate limit exceeded; `Retry-After` header set |
| `INTERNAL_ERROR` | 500 | Unexpected failure; details logged, not returned |

`NOT_FOUND` is returned instead of `403` for resources owned by another user, to prevent ID enumeration.

Every error response includes `X-Request-Id`.

---

## 6. Filtering

One filter object is shared by every read endpoint that reads trades: dashboard, analytics, trade list, exports. This is what makes Blueprint Â§8 (global filtering) work â€” the same filter state drives the whole application.

Query parameters (camelCase), all optional:

| Parameter | Type | Notes |
| --- | --- | --- |
| `accountId` | uuid | Repeatable. Omit = all accounts |
| `from` | `YYYY-MM-DD` | Inclusive, in the account timezone |
| `to` | `YYYY-MM-DD` | Inclusive, in the account timezone |
| `symbol` | string | Repeatable. Matched case-insensitively |
| `direction` | `long` \| `short` | Repeatable |
| `strategyId` | uuid | Repeatable |
| `tagId` | uuid | Repeatable. A trade matches if it has **any** of the listed tags |
| `session` | session enum | Repeatable |
| `status` | trade status | Repeatable. Defaults to `closed` for analytics, all non-deleted for the journal list |
| `minR` | decimal | |
| `maxR` | decimal | |
| `minPnl` | decimal | |
| `maxPnl` | decimal | |
| `emotionTagId` | uuid | Phase 11: filters on tag category `emotion` |
| `brokeRules` | boolean | Phase 11 |
| `hasAttachments` | boolean | |
| `q` | string | Free text over symbol, title, notes |
| `timezone` | IANA | Optional override for date grouping; defaults to account timezone |

Repeatable parameters use repeated keys: `?symbol=XAUUSDc&symbol=EURUSD`. An array-encoded single key is also accepted for compatibility.

The server applies the user's ownership scope to every filter value. Passing another user's `accountId` returns `NOT_FOUND`, not `403`.

Filters are echoed back in `meta.filters` on analytics endpoints so the frontend can verify what was actually applied.

---

## 7. Pagination and sorting

**Cursor pagination** for `trades`:

```
GET /trades?limit=50&cursor=eyJ0IjoiMjAyNi0wOS0zMFQxNDoyMjowNVoxMjNaIiwiaWQiOiIuLi4ifQ
```

Opaque base64url cursor encoding `{ "t": "<entryTime>", "i": "<id>" }`, ordered by `entry_time DESC, id DESC`.

Response:

```json
"pagination": { "limit": 50, "nextCursor": "eyJ0...", "hasMore": true, "totalCount": null }
```

`limit` defaults to 50, maximum 200. `totalCount` is `null` for trade lists by design: an exact count over a large filtered set is expensive and unused. Analytics endpoints return exact counts because they aggregate anyway.

**Offset pagination** is allowed only for bounded, naturally small collections: strategies, tags, risk presets, journal entries within a period, reviews.

**Sorting** on trade lists: `sort=entryTime|exitTime|pnl|rMultiple|quantity`. Default `entryTime`. Always paired with `order=asc|desc`, default `desc`.

---

## 8. Resources

### 8.1 User

```json
{
  "id": "0198...",
  "email": "trader@example.com",
  "displayName": "Ozeyid",
  "timezone": "Europe/Istanbul",
  "baseCurrency": "USD",
  "locale": "en",
  "status": "active",
  "emailVerifiedAt": null,
  "defaultRiskPercent": 1,
  "lastLoginAt": "2026-09-30T12:04:11.882Z",
  "createdAt": "2026-09-01T08:00:00.000Z",
  "updatedAt": "2026-09-30T12:04:11.882Z"
}
```

`passwordHash` is never exposed. `emailVerifiedAt` is `null` until a verification phase exists.

### 8.2 TradingAccount

```json
{
  "id": "0198...",
  "name": "Exness XAUUSDc",
  "broker": "Exness",
  "type": "live",
  "status": "active",
  "currency": "USD",
  "startingBalance": "10000.0000000000",
  "currentBalance": "10245.2000000000",
  "timezone": "Europe/Istanbul",
  "defaultRiskPercent": 1,
  "isDefault": true,
  "notes": null,
  "tradeCount": 42,
  "createdAt": "2026-09-02T10:12:00.000Z",
  "updatedAt": "2026-09-30T14:22:05.123Z",
  "deletedAt": null
}
```

`currentBalance` is computed as `startingBalance + Î£ closed trade pnl` and is always returned in the account's `currency`. `tradeCount` is a **derived** field (count of non-deleted trades for the account).

### 8.3 Trade

```json
{
  "id": "0198...",
  "accountId": "0198...",
  "account": { "id": "0198...", "name": "Exness XAUUSDc", "currency": "USD", "type": "live" },
  "strategyId": "0198...",
  "strategy": { "id": "0198...", "name": "London Breakout", "color": "#D6A84F" },
  "symbol": "XAUUSDc",
  "direction": "long",
  "status": "closed",
  "session": "london",
  "quantity": "40.00000000",
  "entryPrice": "2415.3300000000",
  "exitPrice": "2418.9400000000",
  "stopLoss": "2412.8300000000",
  "takeProfit": "2421.3300000000",
  "entryTime": "2026-09-30T07:45:00.000Z",
  "exitTime": "2026-09-30T09:12:00.000Z",
  "contractSize": "1.0000000000",
  "plannedRisk": "100.0000000000",
  "riskPercent": 1,
  "fees": "1.2000000000",
  "swap": "-0.8000000000",
  "pnl": "-0.5560000000",
  "rMultiple": "-0.0056",
  "mae": null,
  "mfe": null,
  "title": "London sweep reclaim",
  "mistake": null,
  "followedPlan": true,
  "brokeRules": false,
  "tags": [ { "id": "0198...", "name": "A+ setup", "color": "#3FB67A", "category": "setup" } ],
  "executions": [],
  "notes": [],
  "attachments": [],
  "review": null,
  "durationMinutes": 87,
  "createdAt": "2026-09-30T09:20:00.000Z",
  "updatedAt": "2026-09-30T09:20:00.000Z",
  "deletedAt": null
}
```

Nested collections (`executions`, `notes`, `attachments`) are included on the **detail** endpoint only. List endpoints return the trade without them, plus `tags` because tag chips appear in the table.

`durationMinutes` is `exitTime - entryTime` in minutes, `null` while open.

### 8.4 Strategy

```json
{
  "id": "0198...",
  "name": "London Breakout",
  "description": "London session breakout strategy",
  "category": "session",
  "status": "active",
  "color": "#D6A84F",
  "rules": [
    { "id": "0198...", "position": 0, "text": "Higher-timeframe trend aligned", "isRequired": true },
    { "id": "0198...", "position": 1, "text": "Liquidity sweep", "isRequired": true },
    { "id": "0198...", "position": 2, "text": "Risk <= 1%", "isRequired": true }
  ],
  "tradeCount": 18,
  "stats": null,
  "createdAt": "2026-09-05T09:00:00.000Z",
  "updatedAt": "2026-09-05T09:00:00.000Z",
  "deletedAt": null
}
```

`stats` is populated from Phase 9 onward; it is `null` before that. `tradeCount` is a **derived** field (count of non-deleted trades using the strategy).

### 8.5 Tag

```json
{ "id": "0198...", "name": "FOMO", "color": "#D65C5C", "category": "emotion", "tradeCount": 7,
  "createdAt": "...", "updatedAt": "...", "deletedAt": null }
```

`tradeCount` is a **derived** field (count of non-deleted trade_tags for the tag).

### 8.6 JournalEntry

```json
{
  "id": "0198...",
  "accountId": null,
  "entryDate": "2026-09-30",
  "title": "Patience paid off",
  "body": "Waited for London instead of forcing New York setups.",
  "moodScore": 4,
  "wordCount": 11,
  "emotions": [
    { "id": "0198...", "emotion": "FOMO", "intensity": 3, "phase": "before", "note": null, "createdAt": "..." }
  ],
  "tradeSummary": { "tradeCount": 3, "netPnl": "310.4000000000", "closedTrades": 3 },
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null
}
```

`tradeSummary` is a **derived** field (aggregates of trades on the journal's `entryDate`).

### 8.7 Review

```json
{
  "id": "0198...",
  "scope": "weekly",
  "periodStart": "2026-09-28",
  "periodEnd": "2026-10-04",
  "title": "Week 40",
  "body": "Two revenge trades on Thursday.",
  "rating": 3,
  "createdAt": "...",
  "updatedAt": "...",
  "deletedAt": null
}
```

### 8.8 TradeReview (psychology)

```json
{
  "tradeId": "0198...",
  "confidenceBefore": 4,
  "fearBefore": 1,
  "fomoBefore": 2,
  "patienceBefore": 5,
  "followedPlan": true,
  "brokeRules": false,
  "revengeTrade": false,
  "overtraded": false,
  "enteredEarly": false,
  "movedStop": false,
  "rulesFollowed": 100,
  "rating": 4,
  "body": "Textbook entry.",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## 9. Endpoints

### 9.1 System

#### `GET /api/v1/health`

No auth. `200` when the process is up and the database answers a `SELECT 1`. (Full path: `/api/v1/health`; base URL `/api/v1` per Â§1.)

```json
{ "data": { "status": "ok", "version": "0.1.0", "database": "ok", "uptimeSeconds": 4211 } }
```

Returns `503` with `database: "error"` when the database is unreachable. Never exposes connection strings or stack traces.

### 9.2 Authentication

#### `POST /auth/register`

Body:

```json
{ "email": "trader@example.com", "password": "correct horse battery", "displayName": "Ozeyid", "timezone": "Europe/Istanbul", "baseCurrency": "USD" }
```

Validation: email format, password â‰¥ 10 chars, displayName 1â€“80, timezone must be a valid IANA zone, currency ISO 4217.

`201` â†’ user resource; sets `http_at`, `http_rt`, `csrf_token`. Writes an `audit_log` row (`auth.register`).

#### `POST /auth/login`

Body: `{ "email", "password" }`. `200` â†’ user resource + cookies. Rate limit 10/15min per IP. On failure: `401 INVALID_CREDENTIALS`, generic message, no user-enumeration signal, constant-time password comparison. Successful login sets `last_login_at` and audits `auth.login`.

#### `POST /auth/refresh`

No body. Reads `http_rt`. `200` â†’ `{ "data": { "ok": true } }` with a rotated `http_rt` and a fresh `http_at`. Rotates the CSRF token. Reuse â†’ `401 TOKEN_REUSE_DETECTED`.

#### `POST /auth/logout`

Revokes the presented family. `204`. Idempotent.

#### `POST /auth/logout-all`

Revokes every refresh token for the user. `204`.

#### `GET /auth/me`

`200` â†’ user resource. `401 UNAUTHENTICATED` when no valid access token.

#### `GET /auth/csrf`

Unauthenticated bootstrap for the double-submit token (§2.2.1). `200` → `{ "data": { "csrfToken": "<token>" } }`, setting `csrf_token` to the same value. Idempotent: an existing cookie may be replaced with a fresh token. No authentication, no CSRF check, no user data. Rate limit 60/minute per IP.

Each call returns a new value. The server keeps no record of issued tokens — §2.2 is a comparison of the two values the client presents — so rotation on login and refresh replaces the value in the browser rather than revoking an older one. That is sound under the same-origin, `SameSite=strict` topology in `engineering-contract.md` §7.2, where §2.1's "carries no authority on its own" makes the token defence-in-depth. It would not be sufficient for the split-origin topology §7.2 records as the option that was not taken.

#### `POST /auth/forgot-password`

Body `{ "email" }`. Always `202` with a neutral message, whether or not the account exists. Rate limit 3/hour. Emails a single-use token valid 30 minutes.

#### `POST /auth/reset-password`

Body `{ "token", "password" }`. `204`. Revokes all refresh token families. Rate limit 5/hour.

#### `POST /auth/change-password`

Auth required. Body `{ "currentPassword", "newPassword" }`. `204`. Revokes all families **except** the caller's current one, so the user stays signed in.

#### `GET /users/me` Â· `PATCH /users/me`

`GET` returns the user resource. `PATCH` accepts `displayName`, `timezone`, `locale`, `baseCurrency`, `defaultRiskPercent`. Email and password are **not** patchable here. Changing `timezone` does not rewrite existing trades, but it changes future day/week/month analytics grouping; the response states this in `meta.notices` when the field is part of the patch.

### 9.3 Trading accounts

#### `GET /trading-accounts`

Query: `includeArchived` (boolean, default false), `status`.

`200` â†’ collection of trading accounts including computed `currentBalance` and `tradeCount`.

#### `POST /trading-accounts`

Body:

```json
{ "name": "Exness XAUUSDc", "broker": "Exness", "type": "live", "currency": "USD",
  "startingBalance": "10000", "timezone": "Europe/Istanbul", "defaultRiskPercent": 1, "isDefault": true, "notes": null }
```

`201` â†’ trading account. The first account created by a user automatically becomes the default. Duplicate name â†’ `409 CONFLICT`.

#### `GET/PATCH/DELETE /trading-accounts/:id`

`GET` â†’ account plus a light summary (`tradeCount`, `firstTradeAt`, `lastTradeAt`).

`PATCH` accepts the same fields as create. Changing `startingBalance` is rejected once the account has closed trades, because `currentBalance` and equity curves depend on it.

`DELETE` is a soft delete and is rejected with `409 CONFLICT` while closed trades exist. Archive instead.

#### `POST /trading-accounts/:id/archive` Â· `POST /trading-accounts/:id/set-default`

`204`. Archiving hides the account from selectors but keeps all history.

### 9.4 Trades

#### `GET /trades`

Accepts the full filter set (Â§6), cursor pagination and sorting.

```json
{
  "data": [ { } ],
  "meta": {
    "requestId": "0f9c...",
    "filters": { "accountId": null, "from": "2026-09-01", "to": "2026-09-30", "symbol": ["XAUUSDc"], "status": ["closed"] },
    "pagination": { "limit": 50, "nextCursor": "eyJ0...", "hasMore": true, "totalCount": null }
  }
}
```

#### `POST /trades`

Body:

```json
{ "accountId": "0198...", "strategyId": null, "symbol": "XAUUSDc", "broker": "Exness",
  "direction": "long",
  "quantity": "40.00", "entryPrice": "2415.33", "stopLoss": "2412.83", "takeProfit": "2421.33",
  "entryTime": "2026-09-30T07:45:00.000Z", "status": "open", "fees": "0", "swap": "0",
  "exitPrice": null, "exitTime": null, "riskPercent": 1.25, "title": null, "mistake": null,
  "followedPlan": null, "brokeRules": null, "tagIds": [] }
```

Server behaviour, in order:

1. Resolves the account and verifies ownership (`404` if not owned).
2. Normalizes `symbol` to uppercase.
3. Resolves `instrument_specs` for `(broker, symbol)`, user-owned row preferred over the global seed row.
4. Rejects when `instrument_specs.currency â‰  account.currency` with `VALIDATION_ERROR` on `symbol`. No FX conversion exists.
5. Derives `session` from the **UTC clock time** of `entryTime` using the precedence table in `engineering-contract.md` Â§5.3. A client-supplied `session` is rejected as an unknown key; it is never accepted.
6. Snapshots `contractSize` from the resolved spec onto the trade.
7. Computes `plannedRisk = |entryPrice âˆ’ stopLoss| Ã— quantity Ã— contractSize` (rounded to 10 dp).
8. On close, computes `pnl` and `rMultiple` per `database-schema.md` Â§5.1 and Â§5.2.
9. Applies the SL/TP side checks from the schema; violations return `VALIDATION_ERROR` with field paths.
10. Writes `audit_log` (`trade.create`).

`contractSize` may be supplied explicitly only when the account is a `demo` or `prop` account whose spec the owner has confirmed. For `live` accounts the spec value wins and a client-supplied value is rejected.

`201` â†’ trade detail resource.

#### `GET/PATCH/DELETE /trades/:id`

`GET` returns the full detail resource including executions, notes, attachments, review and tags.

`PATCH` is restricted per `status`:

| Status | Patchable |
| --- | --- |
| `planned` | Everything |
| `open` | Everything except `entryPrice`, `quantity`, `direction` (close it first) |
| `closed` | `title`, `mistake`, `followedPlan`, `brokeRules`, tags, notes, attachments, review, `fees`, `exitPrice` (with recompute) |
| `cancelled` | Metadata only; financial fields rejected |

Patching `exitPrice`, `fees`, or any execution recomputes `pnl` and `rMultiple` server-side. The client never supplies them.

`DELETE` is a soft delete. `204`. Closed trades in the last 24 h can still be restored within the API by re-creating with the same fields; permanent purge is an owner-run maintenance task, not an endpoint.

#### `POST /trades/:id/close`

Body:

```json
{ "exitPrice": "2418.94", "exitTime": "2026-09-30T09:12:00.000Z", "fees": "1.20", "note": null }
```

Server sets `status = 'closed'`, computes `pnl` and `rMultiple`, audits. `409 CONFLICT` if already closed or cancelled.

#### `POST /trades/:id/reopen`

Body `{ "reason": string }` (required, 1â€“500 chars). Only `closed` â†’ `open`. Clears exit fields, keeps the reason in `audit_log.metadata`. Rejected when the trade has executions.

#### `POST /trades/:id/cancel`

Body `{ "reason": string }`. Only `planned` or `open` â†’ `cancelled`. Frees the reserved risk amount.

#### `GET/POST /trades/:id/executions`

```json
{ "side": "entry_partial", "price": "2415.10", "quantity": "0.20", "fee": "0.40", "executedAt": "2026-09-30T07:45:12.000Z", "note": null }
```

`sequence` is assigned by the server. Posting an execution recomputes the trade's aggregate `quantity`, `entryPrice`, `exitPrice`, `fees`, `pnl`, `rMultiple` from all executions (quantity-weighted average price). A trade with executions can no longer be patched with direct prices â€” `409 CONFLICT` with a message pointing at executions.

`DELETE /trades/:id/executions/:executionId` removes the fill and recomputes.

#### `GET/POST /trades/:id/notes`

`POST` body `{ "body": string }` (1â€“20000 chars). `201` â†’ note.

#### `PATCH/DELETE /trades/:id/notes/:noteId`

`DELETE` soft-deletes the note. Never deletes the trade.

#### `GET/POST /trades/:id/attachments`

`multipart/form-data` with a single `file` part and optional `kind`.

Validation order: MIME allowlist â†’ magic-byte check â†’ 10 MB limit â†’ decode and re-encode â†’ store under a server-generated key â†’ `CHECKSUM`. Rejections return `415` or `413` with specific messages.

`201` â†’ attachment resource with a short-lived signed URL.

`GET /trades/:id/attachments/:attachmentId` streams the image with `Content-Disposition: inline`. Access is authorized against the trade's owner.

#### `GET/PUT /trades/:id/review`

`GET` â†’ `200` with the review, or `{ "data": null }` when none exists (never `404`, since absence is a normal state). `PUT` upserts. All fields optional; validates the 1â€“5 scales.

#### `PUT/DELETE /trades/:id/tags`

`PUT` body `{ "tagIds": ["0198..."] }` replaces the full set in one transaction. `DELETE` clears all tags. Both verify tag ownership before writing.

### 9.5 Strategies

#### `GET/POST /strategies`

List supports `status`, `q`, offset pagination. Create body: `{ "name", "description?", "category?", "color?" }`.

#### `GET/PATCH/DELETE /strategies/:id`

`DELETE` soft-deletes. `strategy_rules` are removed by cascade. Trades keep `strategyId = NULL` (schema `ON DELETE SET NULL` applies on hard delete; the soft delete leaves the link intact but the strategy becomes unselectable). `GET` from Phase 9 also returns `stats`.

#### `GET/POST /strategies/:id/rules`

`POST` body `{ "text", "isRequired?" }`. Position is assigned as the next gapless integer.

#### `PUT /strategies/:id/rules/order`

Body `{ "ruleIds": ["id3", "id1", "id2"] }`. Rewrites `position` for every rule inside one transaction. A missing or unknown ID rejects the whole reorder.

#### `PATCH/DELETE /strategies/:id/rules/:ruleId`

`PATCH` accepts `text`, `isRequired`. `DELETE` closes the gap in positions.

### 9.6 Tags

#### `GET/POST /tags`

List supports `category`, `q`, `withCounts` (boolean). Create body: `{ "name", "color?", "category?" }`. Name is unique per user, case-insensitive, among non-deleted tags.

#### `PATCH/DELETE /tags/:id`

`DELETE` soft-deletes the tag and its `trade_tags` rows in one transaction, so historical filters do not surface orphaned labels.

### 9.7 Dashboard

#### `GET /dashboard`

Accepts the full filter set. Returns the Phase 8 composition in one round trip.

```json
{
  "data": {
    "metrics": {
      "currency": "USD",
      "netPnl": "245.2000000000",
      "winRate": 62,
      "lossRate": 38,
      "profitFactor": "1.8200",
      "averageR": "0.6400",
      "totalTrades": 50,
      "closedTrades": 50,
      "openTrades": 2,
      "bestTrade": "580.0000000000",
      "worstTrade": "-210.0000000000",
      "averageWin": "212.4000000000",
      "averageLoss": "-116.7000000000",
      "maxDrawdownPercent": 4.8,
      "maxDrawdownAmount": "-486.2000000000",
      "totalR": "32.0000"
    },
    "equityCurve": [ { "date": "2026-09-01", "equity": "10000.0000000000", "drawdownPercent": 0 } ],
    "drawdown": { "maxPercent": 4.8, "maxAmount": "-486.2000000000", "at": "2026-09-14", "currentPercent": 0 },
    "calendar": [ { "date": "2026-09-01", "pnl": "120.0000000000", "tradeCount": 2, "winRate": 50 } ],
    "recentTrades": [ { } ],
    "bySession": [ { "key": "london", "pnl": "180.0000000000", "tradeCount": 12, "winRate": 66.7 } ]
  },
  "meta": { "requestId": "0f9c...", "filters": { } }
}
```

Aggregates spanning accounts of differing currencies are returned only when every included account shares one currency; otherwise `metrics.netPnl` is `null` and `meta.notices` explains why.

### 9.8 Analytics

All analytics endpoints accept the same filter object as `/trades` and echo it in `meta.filters`.

#### `GET /analytics/summary`

The canonical metric block shown for `dashboard`, without the curve, calendar, or recent trades. `status` defaults to `closed`.

#### `GET /analytics/equity-curve`

Query adds `bucket` = `trade` (default) | `day` | `week` | `month`.

```json
{ "data": { "currency": "USD", "startingBalance": "10000.0000000000", "points": [
  { "timestamp": "2026-09-30T09:12:00.000Z", "date": "2026-09-30", "pnl": "245.2000000000", "equity": "10245.2000000000", "drawdownPercent": 0 } ] },
  "meta": { "requestId": "0f9c..." } }
```

#### `GET /analytics/drawdown`

```json
{ "data": { "maxPercent": 4.8, "maxAmount": "-486.2000000000", "peakAt": "2026-09-08", "troughAt": "2026-09-14",
            "recoveredAt": "2026-09-19", "currentPercent": 0, "series": [ { "date": "2026-09-08", "drawdownPercent": 0 }, { "date": "2026-09-09", "drawdownPercent": -1.2 } ] } }
```

Drawdown percentages are returned as negative numbers to match the series shape. `maxPercent` is positive magnitude.

#### `GET /analytics/breakdown`

Query adds `dimension`:

`day` | `week` | `month` | `dayOfWeek` | `timeOfDay` | `strategy` | `symbol` | `session` | `direction` | `tag` | `emotion` (11) | `riskBucket` | `streak`

```json
{ "data": [ { "key": "London Breakout", "secondaryKey": null, "tradeCount": 18, "closedTrades": 18,
              "netPnl": "-140.0000000000", "winRate": 44.4, "profitFactor": "0.8600",
              "averageR": "-0.2200", "averageWin": "180.0000000000", "averageLoss": "-160.0000000000" } ],
  "meta": { "requestId": "...", "dimension": "strategy", "filters": { } } }
```

`key` for `tag` is the tag name, for `strategy` the strategy name, for untagged trades the literal `"untagged"`. Ordered by `netPnl` descending unless `sort` says otherwise.

#### `GET /analytics/calendar`

```json
{ "data": [ { "date": "2026-09-01", "pnl": "120.0000000000", "tradeCount": 2, "winRate": 50, "rMultiple": "1.1000", "hasJournal": true } ] }
```

Only dates with trades are returned. `hasJournal` requires a Phase 11 join and is `false` before that phase.

#### `GET /analytics/streaks`

```json
{ "data": { "currentWinStreak": 3, "currentLossStreak": 0, "maxWinStreak": 7, "maxLossStreak": 4,
            "maxDrawdownStreak": 5, "winStreakHistory": [ { "start": "2026-09-02", "end": "2026-09-04", "length": 3, "pnl": "410.0000000000" } ] } }
```

#### `POST /analytics/trades/export`

Phase 12. Body `{ "format": "csv", "columns": ["entryTime", "symbol", "direction", "pnl", "rMultiple"], "filters": { } }` â€” filters travel in the body so the full filter object fits without URL-length limits. Returns `text/csv` with `Content-Disposition: attachment`.

### 9.9 Risk calculator

#### `POST /risk/calculate`

Stateless. Preserves the proven GoldRisk logic.

```json
{ "accountId": "0198...", "balance": "10000", "riskPercent": "1", "riskAmount": null,
  "direction": "long", "entryPrice": "2415.33", "stopLoss": "2412.83", "takeProfit": "2421.33",
  "broker": "Exness", "symbol": "XAUUSDc",
  "contractSize": "1", "lotStep": "0.01", "minLot": "0.01", "maxLot": "100", "pipValue": null }
```

`200`:

```json
{ "data": { "slDistance": "2.5000000000", "riskAmount": "100.0000000000",
            "exactLot": "0.40000000", "recommendedLot": "0.40000000", "roundedLot": "0.40",
            "actualRisk": "100.0000000000", "rrRatio": "2.4000", "potentialProfit": "240.0000000000",
            "riskPercentActual": "1.0000", "warnings": [] } }
```

Rules:

- `balance` defaults to the account's `currentBalance`; `riskAmount` may be supplied instead of `riskPercent`, never both.
- `exactLot` is the mathematically correct lot. `recommendedLot` is `exactLot` floored to `lotStep` (never rounded up â€” under-risking is the default), with a `warnings` entry when flooring changed the risk by more than 5%.
- `recommendedLot` is clamped to `[minLot, maxLot]`, with a warning.
- `pipValue` and `contractSize` are overridable; defaults come from a symbol profile table added in Phase 10 (`XAUUSDc` on Exness is seeded first).
- Every input is validated: `entryPrice > 0`, `stopLoss > 0`, side correctness, `riskPercent` in `(0, 100]`.
- No database write. Audited only if `accountId` is supplied.

#### `GET/POST/PATCH/DELETE /risk/presets`

Presets store the last-used calculator inputs per user, so the Exness/XAUUSDc workflow is one click. Body mirrors `/risk/calculate` minus computed fields.

### 9.10 Journal

#### `GET /journal/entries`

Query: `from`, `to`, `accountId`, `hasEmotions`, offset pagination (bounded by an explicit period).

#### `POST /journal/entries`

Body: `{ "entryDate", "title?", "body", "moodScore?", "accountId?" }`. Duplicate date for the same user â†’ `409 CONFLICT`. `word_count` is computed server-side.

#### `GET/PATCH/DELETE /journal/entries/:id`

`PATCH` accepts `title`, `body`, `moodScore`, `entryDate`, `accountId`. Moving `entryDate` onto a taken date â†’ `409`.

#### `GET/POST /journal/entries/:id/emotions`

Body: `{ "emotion", "intensity", "phase?", "note?" }`.

#### `DELETE /journal/entries/:id/emotions/:emotionId`

`204`.

#### `GET/POST /reviews`

`GET` filters by `scope`, `periodStart`, `periodEnd`. `POST` body: `{ "scope", "periodStart", "periodEnd", "title?", "body", "rating?" }`. Unique per period â†’ `409`.

#### `PATCH/DELETE /reviews/:id`

`204` on delete.

---

## 10. Phase mapping

All migrations (0001â€“0013) are applied in **Phase 1** when `npm run db:migrate` runs against an empty database. The verification gate requires this: the test database must be created fresh and all migrations applied in one pass.

| Phase | Endpoints delivered | Uses tables created in |
| --- | --- | --- |
| 1 | `/health` | 0001â€“0002 |
| 2 | none (shell only) | â€” |
| 3 | `/auth/*`, `/users/me` | 0003â€“0005 |
| 4 | `/trading-accounts*` | 0006 |
| 5 | `/trades` CRUD, `close`, `reopen`, `cancel` | 0007â€“0010 |
| 6 | `/trades/:id/executions*`, `/trades/:id/notes*`, `/trades/:id/attachments*` | 0010 |
| 7 | `/strategies*`, `/tags`, `/trades/:id/tags` | 0007â€“0008, 0010 (`trade_tags`) |
| 8 | `/dashboard` | 0009 (trades) |
| 9 | `/analytics/*`, strategy stats | 0009 |
| 10 | `/risk/*`, `/risk/presets*`, `instrument_specs` | 0011 |
| 11 | `/trades/:id/review`, `/journal/*`, `/reviews` | 0012–0013 |
| 12 | `/analytics/trades/export`, advanced filtering | â€” |
| 13â€“17 | per phase | per phase |

A phase that needs a table not listed here must add it to `database-schema.md` first.

---

## 11. Revision history

| Date | Phase | Change |
| --- | --- | --- |
| Phase 0 | 0 | Initial API contract locked |
| Phase 0.1 | 0.1 | Migration 0011â€“0013 renumbered; `/auth/logout` paths fixed; bearer=test-only; health endpoint path explicit; derived fields marked; refresh token lifecycle linked to engineering contract; test DB env vars |
