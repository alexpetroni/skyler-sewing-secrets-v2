# PHASE-18 — Admin: products (course, bundles, singles) and scoped promotions

## Why

Composing offers from videos and scoping discount codes to them are the two features the owner
asked for. Services exist (PHASE-08, PHASE-12); this phase is the admin UI with the checklist,
item picker, scope picker, redemption views and bulk generation from `04-admin-offers.md` and
`05-discounts.md`.

## Read first

`docs/analysis/04-admin-offers.md` → Product editor, Core objects; `docs/analysis/05-discounts.md`
→ Admin UI; `src/lib/server/modules/catalog/service.ts`, `src/lib/server/modules/commerce/promo.ts`;
PHASE-16 form helpers and components; `legacy/src/routes/admin/pricing/*` (the promo fields
admins know).

## Deliverables

### 1. Catalogue routes (`/admin/catalogue`)

- List: products with kind, price (sale shown), items count, published/featured flags, sort
  order; “New product” (kind choice: bundle, single; course exists once and is edited only).
- `/admin/catalogue/new?kind=&lesson=`: minimal create (kind, title, slug auto) → redirect to
  the editor; `lesson` pre-fills a single's item.
- `/admin/catalogue/[id]`: one page, five sections, one superform per section (`basics`,
  `contents`, `pricing`, `visibility` actions) so each saves independently:
  basics (title, slug, tagline, description Markdown with the PHASE-17 preview, cover image
  https URL for now), contents (`LessonPicker.svelte`: search via
  `GET /admin/api/lessons?q=` returning 20 matches with module, duration, products already
  containing them; ordered `$state` list; hidden JSON field; disabled for the course), pricing
  (pounds inputs converted with `parsePounds`, sale window, live `effectivePrice` preview),
  visibility (published toggle shows `publishChecklist` unmet items and refuses; featured; sort
  order), side panels: “Where it is sold” (promotions scoped to it) and for each item “also
  in …”. Delete via `ConfirmForm` with the `PRODUCT_HAS_HISTORY` message.
- Publishing calls `revalidate` from `src/lib/server/platform/revalidate.ts` (no-op unless a
  bypass token and site URL are configured; `fetch` with `x-prerender-revalidate` for
  `/catalogue` and the product page; harmless when ISR is not used).

### 2. Promotions routes (`/admin/promotions`)

- List with filters active / scheduled / expired / exhausted, columns from the analysis
  (`12 / 50` redemptions).
- `/admin/promotions/new` and `/admin/promotions/[id]`: code (generate button → 8 random
  upper-case alphanumerics), type, value (percent 1–99 or pounds), scope radio (all / selected
  products with `ProductMultiSelect.svelte` over published products), limits (total, per user),
  window (datetime-local inputs, UTC note), minimum subtotal (pounds), stackable with sale,
  description, active. Validation mirrors `promo.ts`; a `products` scope with no products is a
  field error.
- `/admin/promotions/[id]` detail: redemptions table (order link, buyer email, discount, date,
  order status) + CSV export (`promo.exportRedemptionsCsv`, same quoting rules as PHASE-09);
  deactivate (never delete when redemptions exist; delete allowed only with zero redemptions).
- `/admin/promotions/bulk`: prefix, count (≤ 500), type/value/scope/window → `bulkGenerate`;
  result page lists the codes with a CSV download.

### 3. Tests

`tests/routes/admin-catalogue.test.ts`: create bundle; `contents` action with one lesson on a
bundle → field error; with duplicate ids → deduped; `visibility` publish on an incomplete product
→ form error listing the unmet checklist items; publish on a complete product → published and
audit row; lessons search endpoint admin-only and returns `products` for each lesson.
`tests/routes/admin-promotions.test.ts`: create scoped code with two products; scoped with
none → field error; percent 100 → error; bulk 5 codes each `max_redemptions = 1`; CSV export
quoted; deactivate keeps the row. SSR tests for `LessonPicker` (renders hidden JSON of the
ordered ids) and `ProductMultiSelect`.

Out of scope: image uploads (PHASE-20), Stripe product sync (not planned).

## Steps

1. Lessons search endpoint, `LessonPicker`, catalogue routes + tests, commit.
2. `ProductMultiSelect`, promotions routes + tests, commit.
3. Revalidate adapter (no-op by default), gate once.

## Definition of Done

- [ ] The product editor saves each section independently (four named actions) and publish refuses with the checklist (test).
- [ ] Kind rules from `setItems` surface as field errors (test); the course's contents section is read-only (reviewer reads the page).
- [ ] A `products`-scoped code cannot be saved without products (test); bulk generation yields single-use codes (test).
- [ ] Redemption CSV export quotes every cell (test).
- [ ] `GET /admin/api/lessons` is admin-only and returns at most 20 rows (test).
- [ ] Gate green.
