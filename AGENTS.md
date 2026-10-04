# AGENTS.md — Operating rules for OpenCode

This file is binding for every agent working in this repository. Read it before writing code.

---

## 1. The contract comes first

Three documents define the system. Read the relevant parts before implementing anything:

| Document | What it locks |
| --- | --- |
| `docs/engineering-contract.md` | Decisions, conventions, data rules, security, testing gates |
| `docs/database-schema.md` | Exact schema, DDL, constraints, formulas |
| `docs/api-spec.md` | Exact HTTP contract, envelopes, filters, endpoints |

If the blueprint and these documents disagree with a task request, **stop and say so**. Do not silently pick one.

Never invent a data structure, endpoint, or field name that is not in the contract. If the contract genuinely does not cover something, extend `docs/` first and report the change.

---

## 2. Absolute rules

1. **Do not rewrite working functionality without a stated reason.** If you believe a rewrite is necessary, stop and explain. Do not proceed.
2. **Do not introduce unnecessary dependencies.** Every new runtime dependency needs a written justification in your final report. Prefer the standard library and what is already installed.
3. **Do not make unrelated changes.** No drive-by refactors, renames, formatting sweeps, or "while I was in there" fixes. Every line in your diff must trace to the current phase.
4. **Do not skip tests.** New behaviour ships with tests in the same change. Bug fixes ship with a regression test.
5. **Do not claim completion without showing verification.** "Implemented successfully" is not acceptable. Paste real command output.
6. **Do not commit** unless explicitly asked.
7. **Do not weaken security** to make something work. No disabled validation, no `any` casts to silence the compiler, no secret in source, no query string interpolation.
8. **Do not log sensitive data.** No passwords, tokens, cookies, or auth request bodies.
9. **Do not mock what you are testing.** Tests assert real behaviour against the real database, not a stubbed repository.
10. **Stop at the end of the assigned phase.** Do not continue into the next phase, even if it looks obvious.

---

## 3. Architecture rules

- Backend modules are **vertical slices**: `routes / service / schema / repository` inside one feature folder. No top-level `controllers/`, `services/`, `repositories/` trees.
- Business logic lives in services, never in route handlers.
- All database access goes through Drizzle with bound parameters. Raw SQL with interpolation is prohibited.
- Every request body, query parameter, and route parameter is validated by Zod before reaching a service. Unknown keys are rejected.
- Every read and write of user-owned data resolves with `WHERE id = $1 AND user_id = $2`.
- Money and prices: `numeric` in the database, decimal **strings** over the wire, no `float` in any persisted path.
- Timestamps: UTC everywhere, stored as `timestamptz`.
- `market_session` is derived server-side at write time. Never accept it from a client.
- One implementation per formula. If a P&L or R calculation exists in two places, it belongs in one shared module.

---

## 4. Verification gate (mandatory, all phases)

Run all of these and paste the output:

```bash
npm run test            # unit + api + frontend
npm run typecheck       # tsc --noEmit, both workspaces
npm run lint
npm run build           # production build
git status --short
```

Additional requirements:

- Migrations must be verified against an **empty** database, not only an already-migrated one.
- Every API test that touches user-owned data must include a cross-user negative case.
- If a command fails, report the failure. Never describe a phase as complete with a failing check.

---

## 5. Reporting format

End every phase with this exact structure:

```
Phase N — <name>

Implemented
  - <path> — <what it does>

Migrations
  - <files>; applies cleanly to empty DB: yes/no

Verification
  - unit tests:     <n> passed, <n> failed
  - api tests:      <n> passed, <n> failed
  - frontend tests: <n> passed, <n> failed
  - typecheck:      clean | <errors>
  - lint:           clean | <errors>
  - build:          success | <errors>
  - git status:     <files changed>

Deviations from the contract
  - <none> | <list with justification>

Manual checklist for the owner
  1. <concrete step>
  2. ...

Open questions
  - <anything the owner must decide>
```

Do not summarise instead of showing output. Do not omit failures.

---

## 6. Environment reminders

- `node v24.18.0`, `npm 11.16.0`. No `pnpm`, no `yarn`, no Docker on this machine.
- **PostgreSQL 18.4 is installed locally** at `C:\Program Files\PostgreSQL\18`, service `postgresql-x64-18` running, listener on `127.0.0.1:5432`, auth `scram-sha-256`. `psql` is available at `C:\Program Files\PostgreSQL\18\bin\psql.exe` (not on PATH by default).
- Migrations run via npm scripts (`npm run db:migrate`), never via a `psql` binary. The local `psql` is for **manual owner inspection only**.
- Secrets live in `.env` only. `.env` is git-ignored. `.env.example` lists names with empty values.
- npm workspaces are in use. Run installs from the repository root.

---

## 7. Current state

Phases 0, 0.1, 1 and 2 are complete. Phase 1 G1–G5 were verified by the owner on 2026-10-02; Phase 2 G1–G5 were verified on 2026-10-03, including the visual review of every UI primitive.

The UI direction is **light-and-purple**, changed from the original dark-and-gold at the owner's instruction (ADR-014). The authoritative token table is `docs/phase-plan.md`, Phase 2, "Design token system".

`frontend/src/dev/PrimitivesShowcase.tsx` is a **development-only** review page at `/dev/primitives`. It is not a route, is not in the navigation, and is absent from the production bundle. Do not register it as a route and do not treat it as application code.

**Next action: Phase 3 — Authentication + users** (`docs/phase-plan.md`). Its precondition is already satisfied: the owner approved **same-origin production hosting** on 2026-10-03, recorded in `docs/README.md` under "Recorded owner decisions". Implement the cookie and CSRF behaviour from `docs/engineering-contract.md` §7.2 as written — httpOnly cookies, `SameSite=Strict` in production, CSRF double-submit retained as defence-in-depth. Phase 3 creates no migrations: 0001–0013 already exist from Phase 1.