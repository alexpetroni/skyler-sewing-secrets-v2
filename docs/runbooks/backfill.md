# Backfill runbook

Turns the legacy rows in the shared Neon database into v2 rows: `media_assets` from
`lessons.video_url`, the flagship `products` row from `pricing_config`, `orders` + `order_items` +
`promo_redemptions` from `payments`, an all-access `entitlements` row for every
`profiles.is_member = true` account, and the v2 promo columns from the legacy ones. The code is in
`src/lib/server/db/backfill/`; the CLI is `scripts/backfill/run.ts` (`npm run backfill`).

Every step is additive and idempotent: it only inserts or fills rows that are still missing, so a
second run reports zeros and the legacy app, which ignores the new tables and columns, keeps
working throughout. Do the rehearsal on a Neon branch first; production follows the same commands.

## Prerequisites

- Node 24, `npm ci` in a checkout of the release that will be deployed.
- The Neon CLI (`npm i -g neonctl`, `neonctl auth`) or the Neon console.
- Two connection strings per branch from Neon: the **direct** one (no `-pooler` in the host) for
  `db:migrate`, and either one for the backfill.

## 1. Rehearsal on a branch

```sh
# A copy-on-write branch of production, taken now.
neonctl branches create --name backfill-rehearsal --parent production
export DATABASE_URL="$(neonctl connection-string backfill-rehearsal)"
export DATABASE_DRIVER=neon
```

Run the commands in this exact order. Each step first runs with `--dry-run` (inside a transaction
that is rolled back, printing the counts it would apply); read the counts, then run it for real.

```sh
npm run db:migrate                                   # applies drizzle/0002+ (additive)

npm run backfill -- --step media-assets --dry-run
npm run backfill -- --step media-assets
npm run backfill -- --step flagship-product --dry-run
npm run backfill -- --step flagship-product
npm run backfill -- --step orders --dry-run
npm run backfill -- --step orders
npm run backfill -- --step entitlements --dry-run
npm run backfill -- --step entitlements
npm run backfill -- --step promo-codes --dry-run
npm run backfill -- --step promo-codes

npm run backfill -- --step all --dry-run             # must print 0 for every count
```

`orders` and `entitlements` refuse to run before `flagship-product`. `--step all` runs the five
steps in one transaction (a failure leaves the branch untouched); it is the same work, and the
last command above proves the backfill is complete.

What the counts mean:

| Step | Metric | Expect |
| --- | --- | --- |
| `media-assets` | `media_assets_inserted` | distinct `bunny:` values in `lessons.video_url` |
| | `lessons_linked` | lessons with a `bunny:` `video_url` |
| | `articles_converted` | legacy `lesson_type = 'article'` lessons |
| `flagship-product` | `products_inserted`, `product_id` | 1 on the first run, then 0 with the same id |
| `orders` | `orders_inserted`, `order_items_inserted` | one each per `payments` row |
| | `promo_redemptions_inserted` | payments with a `promo_code_id` |
| `entitlements` | `entitlements_from_purchase` + `entitlements_from_migration` | members (`is_member = true`) |
| `promo-codes` | `promo_codes_updated` | codes with legacy validity values |

## 2. Verification SQL

Run on the branch (`psql "$DATABASE_URL"` or the Neon SQL editor). Every query has an expected
answer; investigate any difference before touching production.

```sql
-- Members vs all-access entitlements: the two numbers are equal and the list is empty.
SELECT
  (SELECT count(*) FROM profiles WHERE is_member) AS members,
  (SELECT count(DISTINCT e.user_id)
     FROM entitlements e JOIN products p ON p.id = e.product_id
    WHERE p.access_scope = 'all' AND e.revoked_at IS NULL) AS all_access_holders;

SELECT pr.id FROM profiles pr
 WHERE pr.is_member
   AND NOT EXISTS (
     SELECT 1 FROM entitlements e JOIN products p ON p.id = e.product_id
      WHERE e.user_id = pr.id AND p.access_scope = 'all' AND e.revoked_at IS NULL);

-- Payments vs orders: equal counts and totals, no payment without its order.
SELECT
  (SELECT count(*) FROM payments) AS payments,
  (SELECT count(*) FROM orders o WHERE EXISTS (SELECT 1 FROM payments p WHERE p.id = o.id))
    AS backfilled_orders,
  (SELECT coalesce(sum(amount), 0) FROM payments) AS payments_pence,
  (SELECT coalesce(sum(o.total), 0) FROM orders o JOIN payments p ON p.id = o.id) AS orders_pence;

SELECT p.id, p.status FROM payments p LEFT JOIN orders o ON o.id = p.id WHERE o.id IS NULL;

SELECT p.status AS payment_status, o.status AS order_status, count(*)
  FROM payments p JOIN orders o ON o.id = p.id
 GROUP BY 1, 2 ORDER BY 1, 2;

-- Lessons with and without assets: every video lesson has one; the list is empty.
SELECT kind,
       count(*) FILTER (WHERE media_asset_id IS NOT NULL) AS with_asset,
       count(*) FILTER (WHERE media_asset_id IS NULL) AS without_asset
  FROM lessons GROUP BY kind ORDER BY kind;

SELECT id, slug, video_url FROM lessons WHERE kind = 'video' AND media_asset_id IS NULL;

-- One flagship, priced as pricing_config said.
SELECT p.slug, p.price, p.is_published, c.base_price
  FROM products p CROSS JOIN pricing_config c
 WHERE p.access_scope = 'all' AND c.is_active;
```

Then point a preview deployment of v2 at the branch (`DATABASE_URL` for the Preview environment)
and sign in as a known member and as the admin: the member's library lists the course and a
lesson plays; Admin → Users shows the member with the course entitlement.

## 3. Rollback

- **Rehearsal branch**: reset it to production's current state and start again, or delete it.

  ```sh
  neonctl branches reset backfill-rehearsal --parent   # console: Branches → Reset from parent
  neonctl branches delete backfill-rehearsal           # when finished
  ```

- **Production**: before running anything, create a snapshot branch
  (`neonctl branches create --name pre-backfill-$(date +%F) --parent production`). The backfill
  only adds rows the legacy app never reads, so a wrong count is fixed forward (correct the data,
  re-run the step: it fills only what is missing). Restoring production from the snapshot branch
  is the last resort: it also discards every legacy write made since, so do it only with the
  maintenance switch on and after exporting any payments taken in between.

## 4. Production run

Same commands as section 1 with `DATABASE_URL` set to the production branch, at a quiet hour,
after the snapshot branch exists. The legacy site stays up. Run the section 2 queries again and
keep their output with the launch notes. Members who join on the legacy site after the backfill
are covered by re-running `--step entitlements` (and `--step orders` for their payments) on launch
day; the steps only add what is missing.
