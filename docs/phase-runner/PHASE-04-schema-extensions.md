# PHASE-04 — Schema extensions: products, orders, entitlements, media, promos, audit; backfill

## Why

The legacy schema cannot express the new product (`03-architecture.md` → “What works against
change”). This phase adds every v2 table and column as **additive** migrations on top of the
baseline, so the legacy app keeps running on the same Neon database until v2 takes over, and it
ships the backfill that turns legacy rows into v2 rows (members → all-access entitlements,
payments → orders, `pricing_config` → the flagship product, `lessons.video_url` →
`media_assets`).

## Read first

`docs/analysis/03-architecture.md` → Data model and “Taking over production” (backfill list);
`docs/analysis/05-discounts.md` → Target model and “Migration from the current table”;
`src/lib/server/db/schema/*` (PHASE-03); Better Auth plugin schemas in
`node_modules/better-auth/dist/plugins/two-factor/` and the rate-limit table definition
(`node_modules/better-auth/dist/**/rate-limit*`), or `npx @better-auth/cli@latest generate`
output if it can run without a database.

## Deliverables

### 1. New schema modules

- `schema/media.ts` — `media_assets` as specified (unique `(library_id, video_id)`, `status`
  enum `media_status`: `uploading | processing | ready | failed`).
- `schema/content.ts` — add to `lessons`: `media_asset_id uuid null → media_assets`,
  `kind` enum `lesson_kind` (`video | article`) default `'video'`, `content_md text null`,
  `content_html text null`; make `module_id` **nullable** (`ALTER COLUMN DROP NOT NULL` is
  additive); add a partial unique index on `slug` where `module_id IS NULL`. Add to `modules`:
  `is_course_content boolean not null default true`. Keep `video_url`, `lesson_type`,
  `content` and `duration_minutes` for the legacy app (dropped later).
- `schema/catalog.ts` — `products` (enums `product_kind`: `course | bundle | single`,
  `access_scope`: `all | items`; all columns from the analysis incl. `sale_*`, `is_published`,
  `is_featured`, `sort_order`, `stripe_product_id`), `product_items` (pk `(product_id,
  lesson_id)`, `sort_order`).
- `schema/commerce.ts` — `orders` (enum `order_status`: `pending | paid | expired | refunded |
  partially_refunded | disputed`; `user_id` → `profiles` **RESTRICT**; `stripe_checkout_session_id`
  unique; `expires_at`), `order_items` (price snapshots, `refunded_amount`),
  `promo_code_products`, `promo_redemptions` (`order_id` unique), and the **additive** promo
  columns on `promo_codes`: `applies_to` enum `promo_scope` (`all | products`) default `'all'`,
  `max_redemptions`, `max_redemptions_per_user`, `min_subtotal`, `starts_at` (nullable,
  backfilled from `valid_from`), `ends_at`, `stackable_with_sale boolean default false`.
- `schema/entitlements.ts` — `entitlements` (enum `entitlement_source`: `purchase | migration |
  admin_grant | gift`; partial unique index `(user_id, product_id) WHERE revoked_at IS NULL`;
  index `(user_id, revoked_at)`).
- `schema/ops.ts` — `webhook_events` (`provider`, `event_id`, unique `(provider, event_id)`,
  `type`, `received_at`, `processed_at`, `error`), `audit_log` (jsonb `before`/`after`),
  `request_limits` (`key text pk`, `count integer`, `window_start timestamptz`).
- `schema/auth.ts` — the Better Auth `twoFactor` plugin table and the `users.twoFactorEnabled`
  column, and the `rateLimit` table for `storage: 'database'`, with the exact names Better Auth
  expects (plural table names to match `usePlural: true`; verify against the plugin source and
  write the source path in a comment).
- `schema/marketing.ts` — `newsletter_subscribers`: `confirmed_at timestamptz null`,
  `confirm_token_hash text null`.
- `schema/profiles.ts` — no change (`email` and `is_member` stay until retirement).
- `relations.ts` extended for the new tables; `index.ts` re-exports all.

### 2. Migration

`npm run db:generate` → one file `drizzle/0002_v2_catalogue.sql` (rename the generated file
and update `meta/_journal.json` accordingly, keeping the generated snapshot) . Read the SQL:
it must contain no `DROP TABLE`, no `DROP COLUMN`, no `SET NOT NULL`, no type change on a
legacy column, no `DELETE`. If the generator emits any of those, the schema deviates from the
baseline: fix the schema, not the SQL. Hand-written SQL is allowed only to seed enum values or
to add the partial unique indexes if the generator cannot express them (append in the same
file after `--> statement-breakpoint`).

### 3. Backfill functions and CLIs

`src/lib/server/db/backfill/` exports pure-ish functions taking a `Db` (or `Tx`), each
idempotent and returning counts:

- `backfillMediaAssets(db)`: distinct `lessons.video_url` matching `^bunny:(\d+)/(.+)$` →
  `media_assets` (`status 'ready'`, `duration_seconds = duration_minutes * 60` when known) and
  `lessons.media_asset_id` set; article-type lessons get `kind = 'article'`,
  `content_md = NULL`, `content_html = content` (legacy HTML, already admin-authored).
- `backfillFlagshipProduct(db)`: one `products` row `kind 'course'`, `access_scope 'all'`,
  `slug 'skylers-sewing-secrets'`, title “Skyler's Sewing Secrets — Lifetime Access”, price
  and currency from the active `pricing_config`, `is_published = true`, `is_featured = true`.
  Returns its id; running twice returns the same id.
- `backfillOrders(db)`: one `orders` + `order_items` row per `payments` row (status
  `succeeded → paid`, `refunded → refunded`, else `pending`), `total = amount`,
  `discount_total = discount_amount`, `subtotal = total + discount_total`,
  `stripe_checkout_session_id`/`payment_intent` copied, `paid_at = created_at`, item =
  flagship product with the same amounts; `promo_redemptions` for rows with `promo_code_id`.
  Keyed on `stripe_checkout_session_id` (or `payments.id` when null) so re-runs insert
  nothing.
- `backfillEntitlements(db)`: for every `profiles.is_member = true`, an active entitlement to
  the flagship product: `source 'purchase'` + `order_item_id` when a paid order exists for
  the user, else `source 'migration'`; `granted_at = member_since ?? created_at`.
- `backfillPromoCodes(db)`: `starts_at = valid_from`, `ends_at = valid_until`,
  `max_redemptions = max_uses`, `min_subtotal = min_purchase_amount` where null.
- `runAll(db)` in dependency order.

`scripts/backfill/run.ts` (tsx CLI): `--step <name>|all`, `--dry-run` (runs inside a
transaction and rolls back, printing counts), reads `DATABASE_URL`/`DATABASE_DRIVER` from
`process.env` (CLI, allowed), prints a summary table. `package.json` script `backfill`.

### 4. Tests

- `tests/db/migrations.test.ts` extended: all new tables and enums exist; `lessons.module_id`
  is nullable; the partial unique index on `entitlements` rejects a second active row for the
  same `(user_id, product_id)` and accepts one after revocation.
- `tests/backfill/backfill.test.ts`: seed legacy-shaped data on PGlite (two members, one
  non-member, three payments one with a promo, seven lessons across two modules with
  `bunny:` urls, one article lesson, one active pricing row) → `runAll` → assert counts and
  shapes (one product, three orders with items, two entitlements with the right sources,
  one redemption, media assets linked, `is_member` unchanged); run `runAll` again → every
  count unchanged (idempotent).
- A test that `0002` applies cleanly on top of `0000`/`0001` is implicit in `createTestDb`.

Out of scope: services using these tables, `is_member` synchronisation (PHASE-08), dropping
legacy columns, Better Auth configuration.

## Steps

1. Schema modules, commit per file group.
2. Generate migration, inspect SQL, rename, commit `feat(db): additive v2 migration 0002`.
3. Backfill functions + CLI + tests, commit.
4. Gate once.

## Definition of Done

- [ ] Exactly one new migration file and one new snapshot exist; `drizzle/0000*`, `0001*` unchanged (`cmp` against `legacy/drizzle/`).
- [ ] `grep -nE 'DROP (TABLE|COLUMN)|SET NOT NULL|SET DATA TYPE|^DELETE' drizzle/0002_v2_catalogue.sql` returns nothing (reviewer also reads the file).
- [ ] After the migration `npx drizzle-kit generate` creates no further file (schema and snapshot agree).
- [ ] All tables and columns listed in Deliverable 1 exist in the schema modules with the stated enums, uniqueness and FK actions (`orders.user_id` RESTRICT; `entitlements` partial unique index).
- [ ] Better Auth plugin tables match the plugin's expected names/columns; the comment cites the source file inspected.
- [ ] `tests/backfill/backfill.test.ts` seeds, runs, asserts and re-runs as specified; `tests/db/migrations.test.ts` has the nullable and partial-unique assertions.
- [ ] `scripts/backfill/run.ts` supports `--step`, `--dry-run`, prints counts; `npm run backfill -- --help` exits 0 (tsx is a devDependency).
- [ ] Gate green.
