-- Retire the legacy columns and tables v2 no longer needs.
--
-- NOT APPLIED and NOT a Drizzle migration: nothing under drizzle/ includes or
-- references this file. Run it only after:
--   1. the legacy app has been off the production domain for two weeks
--      (docs/runbooks/launch.md, "Retirement window") and its Vercel project
--      is deleted or paused, so nothing else reads these columns;
--   2. every code change listed below has shipped, with the gate green;
--   3. a Neon branch snapshot named `pre-retire-<date>` exists.
--
-- Rehearse on a fresh branch of production first (same procedure as
-- docs/runbooks/backfill.md), then deploy the code changes, then run this on
-- production. To keep drizzle/meta in step, the shipped form of this file is
-- the migration `npm run db:generate` emits after the schema edits below:
-- compare that output with these statements before applying it.
--
-- Each block names the v2 code that still touches the object today and the
-- change it needs first. Paths are under src/ unless stated.

BEGIN;

-- ─── pricing_config ─────────────────────────────────────────────────────────
-- Replaced by the flagship `products` row (kind 'course', access_scope 'all').
-- Code changes:
--   - lib/server/db/schema/legacy-commerce.ts: delete `pricing_config`.
--   - lib/server/db/backfill/flagship-product.ts: delete the step (it reads the
--     price from pricing_config); remove it from backfill/index.ts and
--     tests/backfill/backfill.test.ts.
--   - tests/helpers/db.ts: drop the truncateAll() note about its seed row.
-- Its update trigger (update_pricing_config_updated_at, 0001) goes with it.
DROP TABLE IF EXISTS pricing_config;

-- ─── payments ───────────────────────────────────────────────────────────────
-- Replaced by `orders` + `order_items`; the backfill copied every row and the
-- orders reuse the payment ids.
-- Code changes:
--   - lib/server/db/schema/legacy-commerce.ts and schema/relations.ts: delete
--     `payments` and its relations.
--   - lib/server/modules/commerce/promo.ts (delete guard): stop checking
--     `payments.promo_code_id`; the backfilled orders carry the same promo_code_id.
--   - lib/server/db/backfill/orders.ts: delete the step and its tests.
-- (The `payments` gateway in runtime/container.ts is the Stripe adapter, not
-- this table: no change there.)
DROP TABLE IF EXISTS payments;

-- ─── profiles.email ─────────────────────────────────────────────────────────
-- `users.email` (Better Auth) is the source of truth.
-- Code changes:
--   - lib/server/db/schema/profiles.ts: remove `email`.
--   - lib/server/modules/auth/service.ts: createCredentialUser and
--     ensureProfile stop inserting it; exportData reads users.email.
--   - lib/server/modules/admin/queries.ts: user search, user list and order
--     list join `users` and filter/select `users.email`.
--   - lib/server/modules/marketing/service.ts (testimonial author) and
--     lib/server/modules/commerce/promo.ts (redemption export): join `users`.
--   - tests/helpers/fixtures.ts and every test inserting profiles.email.
ALTER TABLE profiles DROP COLUMN IF EXISTS email;

-- ─── profiles.is_member ─────────────────────────────────────────────────────
-- Kept only for the legacy app; access comes from `entitlements`.
-- Code changes:
--   - lib/server/db/schema/profiles.ts: remove `is_member` and
--     idx_profiles_is_member (the index drops with the column).
--   - lib/server/modules/entitlements/service.ts: delete syncIsMember and its
--     calls in grant/revoke/revokeByOrderItems.
--   - lib/server/modules/auth/service.ts: suspend/anonymise stop writing it;
--     the export reports `hasAllAccess` instead.
--   - lib/server/modules/admin/queries.ts, admin/service.ts and
--     routes/admin/users/[id]/+page.svelte: show "Member" from
--     entitlements.hasAllAccess, not the flag.
--   - lib/server/db/backfill/entitlements.ts: delete the step (it reads the
--     flag to find members); tests/helpers/fixtures.ts comments.
ALTER TABLE profiles DROP COLUMN IF EXISTS is_member;

-- ─── lessons: video_url, lesson_type, content, duration_minutes ─────────────
-- Replaced by media_asset_id, kind, content_md/content_html and
-- media_assets.duration_seconds.
-- Code changes:
--   - lib/server/db/schema/content.ts: remove the four columns.
--   - lib/server/modules/content/service.ts: lesson create/update stop writing
--     `lesson_type` (mirrored from `kind` today).
--   - lib/server/db/backfill/media-assets.ts: delete the step (it parses
--     video_url, lesson_type, content and duration_minutes).
--   - lib/server/db/schema/media.ts: drop the comment pointing at video_url.
--   - scripts/seed-dev.ts: stop writing the `bunny:` video_url.
ALTER TABLE lessons DROP COLUMN IF EXISTS video_url;
ALTER TABLE lessons DROP COLUMN IF EXISTS lesson_type;
ALTER TABLE lessons DROP COLUMN IF EXISTS content;
ALTER TABLE lessons DROP COLUMN IF EXISTS duration_minutes;

-- ─── promo_codes legacy validity columns ────────────────────────────────────
-- Replaced by max_redemptions, count(promo_redemptions), starts_at, ends_at
-- and min_subtotal.
-- Code changes:
--   - lib/server/db/schema/legacy-commerce.ts: remove the five columns.
--   - lib/server/modules/commerce/promo.ts: create, update and bulk-create stop
--     mirroring the v2 values into max_uses, valid_from, valid_until and
--     min_purchase_amount.
--   - lib/server/db/backfill/promo-codes.ts: delete the step.
--   - lib/server/db/schema/commerce.ts: drop the current_uses comment.
-- increment_promo_code_usage() (0001) updates current_uses: drop it first.
DROP FUNCTION IF EXISTS increment_promo_code_usage(UUID);
ALTER TABLE promo_codes DROP COLUMN IF EXISTS max_uses;
ALTER TABLE promo_codes DROP COLUMN IF EXISTS current_uses;
ALTER TABLE promo_codes DROP COLUMN IF EXISTS valid_from;
ALTER TABLE promo_codes DROP COLUMN IF EXISTS valid_until;
ALTER TABLE promo_codes DROP COLUMN IF EXISTS min_purchase_amount;

COMMIT;
