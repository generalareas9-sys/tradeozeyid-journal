import { defineConfig } from 'drizzle-kit';

/**
 * `npm run db:generate` — produces a SQL snapshot of the Drizzle schema
 * definitions in `src/db/schema` for review and drift comparison.
 *
 * Two deliberate choices:
 *
 * 1. `schema` points at the **compiled** schema (`dist/db/schema/index.js`).
 *    drizzle-kit 0.24 loads the schema through a CommonJS require hook, which
 *    cannot follow the NodeNext ESM `.js` specifiers used by the source files.
 *    The build therefore runs first (see the `db:generate` script).
 *
 * 2. The output is **not** the migration source. The committed, reversible
 *    migrations in `src/db/migrations` are what `npm run db:migrate` applies,
 *    and drizzle-kit 0.24 does not emit `CHECK` constraints — using its output
 *    as a migration would silently drop every `ck_*` rule in
 *    docs/database-schema.md.
 */
export default defineConfig({
  schema: './dist/db/schema/index.js',
  out: './src/db/generated',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
});