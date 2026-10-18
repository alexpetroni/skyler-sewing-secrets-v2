# PHASE-03 — Database layer, legacy schema baseline, PGlite test harness

## Why

v2 runs against the production Neon database that the legacy app already populated and
migrated (`drizzle/0000_init.sql`, `0001_triggers_functions_seed.sql`, recorded in
`__drizzle_migrations` by hash). The v2 schema must therefore start from an exact copy of the
legacy tables and migration history, so that `drizzle-kit generate` produces only additive
migrations later and `drizzle-kit migrate` on Neon applies only the new files. This phase also
gives every later phase a real Postgres to test against: PGlite with all migrations applied.

## Read first

`legacy/src/lib/server/db/schema.ts` (whole file), `legacy/src/lib/server/db/index.ts`,
`legacy/drizzle/` (both SQL files and `meta/`), `legacy/drizzle.config.ts`,
`docs/analysis/03-architecture.md` → Stack
(Database row) and Data model.

## Deliverables

### 1. Migration history baseline

Copy `legacy/drizzle/` to `drizzle/` byte for byte (`0000_init.sql`,
`0001_triggers_functions_seed.sql`, `meta/_journal.json`, `meta/0000_snapshot.json`,
`meta/0001_snapshot.json`). `drizzle.config.ts`: `schema: './src/lib/server/db/schema/index.ts'`,
`out: './drizzle'`, `dialect: 'postgresql'`, `dbCredentials.url` from `process.env.DATABASE_URL`
(this file is a CLI config, the only place `process.env` is allowed), `strict: true`,
`verbose: true`.

### 2. Schema modules (`src/lib/server/db/schema/`)

Split the legacy schema into files without changing any table, column, type, default, index,
constraint or enum name: `auth.ts` (users, sessions, accounts, verifications),
`profiles.ts`, `content.ts` (modules, lessons, lesson_resources, user_progress),
`marketing.ts` (blog_posts, testimonials, faq_items, contact_submissions,
newsletter_subscribers), `legacy-commerce.ts` (pricing_config, promo_codes, payments),
`settings.ts` (site_settings), `relations.ts` (the legacy relations), `index.ts` re-exporting
everything. Keep the comment explaining the camelCase/snake_case split for Better Auth tables.

### 3. Database client (`src/lib/server/db/index.ts`)

- `export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>`
  (or the narrowest common supertype of the Neon and PGlite drizzle instances that still
  supports `db.query.*` and `db.transaction`; document the choice in a comment).
- `createDb(options: { url: string; driver?: 'neon' | 'pglite' }): Promise<Db>`:
  `neon` → `drizzle(new Pool({ connectionString: url }), { schema })` from
  `drizzle-orm/neon-serverless` and `@neondatabase/serverless`; `pglite` → `drizzle(new PGlite(dataDir), { schema })`
  from `drizzle-orm/pglite` where `pglite://memory` means in-memory and `pglite://./path` a
  directory. Driver defaults from the URL scheme.
- `export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]` and
  `withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T>`.
- No env access in this file (the runtime container, PHASE-05, calls `createDb`).

### 4. Test harness (`tests/helpers/db.ts`)

`createTestDb(): Promise<{ db: Db; close(): Promise<void>; truncateAll(): Promise<void> }>`:
in-memory PGlite, migrations applied with `migrate` from `drizzle-orm/pglite/migrator`
(`migrationsFolder: './drizzle'`), `truncateAll` truncates every public table except
`__drizzle_migrations` with `CASCADE`. Export a `describeDb` or `beforeAll/afterAll` helper
pattern used by later tests (one PGlite per test file).

### 5. Tests

- `tests/db/migrations.test.ts`: after `createTestDb()`, `information_schema.tables` contains
  all 17 legacy tables; `pg_proc` contains `update_updated_at` and `increment_promo_code_usage`;
  `pricing_config` has the default row and `site_settings` has `maintenance_mode = 'false'`;
  inserting a `users` row then a `profiles` row and updating it bumps `updated_at` (trigger).
- `tests/db/client.test.ts`: `createDb({ url: 'pglite://memory' })` returns an instance whose
  `withTx` rolls back on a thrown error (insert inside the callback, throw, assert the row is
  absent) and commits otherwise.

Out of scope: any new table or column (PHASE-04), seeds, Better Auth.

## Steps

1. Copy migrations, write `drizzle.config.ts`, commit `chore(db): baseline migrations from legacy`.
2. Schema modules, commit; run `npx drizzle-kit generate` and confirm it reports no changes
   (if it generates a file, the schema deviates from the snapshot: fix the schema, delete the
   generated file and its snapshot).
3. Client + `withTx`, commit.
4. Harness + tests, commit.
5. Gate once.

## Definition of Done

- [ ] `cmp drizzle/0000_init.sql legacy/drizzle/0000_init.sql && cmp drizzle/0001_triggers_functions_seed.sql legacy/drizzle/0001_triggers_functions_seed.sql && cmp drizzle/meta/_journal.json legacy/drizzle/meta/_journal.json` all succeed; `drizzle/meta/` has exactly the two legacy snapshots.
- [ ] `npx drizzle-kit generate` exits 0 and creates no new file under `drizzle/` (reviewer runs it with a dummy `DATABASE_URL=postgresql://x@localhost/x` and checks `git status --porcelain drizzle` is empty).
- [ ] `src/lib/server/db/schema/index.ts` exports every table, enum and relation that `legacy/src/lib/server/db/schema.ts` exports (reviewer compares export lists).
- [ ] `src/lib/server/db/index.ts` exports `Db`, `Tx`, `createDb`, `withTx`; it imports nothing from `$app/env` and reads no `process.env`.
- [ ] `tests/helpers/db.ts` exists; `tests/db/migrations.test.ts` and `tests/db/client.test.ts` contain the listed cases and pass.
- [ ] `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `@electric-sql/pglite` are the only dependencies added.
- [ ] Gate green: check (0/0), lint, build with no env, test with 0 skipped.
