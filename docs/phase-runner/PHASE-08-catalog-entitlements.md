# PHASE-08 — Catalog and entitlements: products, items, sale prices, who can watch what

## Why

This is the heart of the new product: a `products` table with the flagship all-access course,
bundles and singles, and `entitlements` that say which user owns which product. From here on,
“member” means “has an active all-access entitlement” and lesson access is a query, not a flag.
`profiles.is_member` is kept in sync for the legacy app that still runs on the same database.

## Read first

`docs/analysis/03-architecture.md` → Data model (products, product_items, entitlements), Access
resolution, Cart rules; `docs/analysis/04-admin-offers.md` → Core objects, Product editor
(publish checklist); entry file → Domain facts; `src/lib/server/modules/content/` (PHASE-07);
`src/lib/server/http/create-handle.ts` and `tests/routes/hooks.test.ts` (PHASE-05).

## Deliverables

### 1. `src/lib/server/modules/catalog/`

`pricing.ts` (pure): `effectivePrice(product, now): { listPrice, price, onSale, saleEndsAt }`
(sale applies when `sale_price` is set and `now` is inside `[sale_starts_at ?? -∞, sale_ends_at ?? +∞)`).

`createCatalogService({ db, content, log })`:
- `flagship()` → the single `access_scope = 'all'` product (throws `NO_FLAGSHIP` if absent).
- `listPublished({ kind?, now })` → products with `effectivePrice`, item counts and total
  duration, ordered by `is_featured desc, sort_order, title`; `getPublishedBySlug(slug, now)`
  with its lessons (title, slug, module, duration, `isFreePreview`).
- Admin: `listAll()`, `getById`, `create(input)` (kind fixed at creation; `access_scope` is
  `'all'` only for `kind = 'course'` and only if no flagship exists), `update(id, input)`,
  `setItems(id, lessonIds[])` (validates every id is a lesson; `single` → exactly one;
  `course` → none; dedupes; keeps order), `publishChecklist(id)` → array of unmet conditions
  (`cover`, `description`, `price >= 30`, `items` (bundle ≥ 2, single = 1), every item lesson
  published, every video item's media `ready`), `publish(id)` (refuses with the checklist),
  `unpublish(id)`, `remove(id)` (refuses when any `order_items` or `entitlements` reference it:
  `PRODUCT_HAS_HISTORY`).
- Lookups for pages: `productsContainingLesson(lessonId, { publishedOnly })`,
  `cheapestProductForLesson(lessonId, now)` (the cheapest published product whose items contain
  the lesson, or the flagship when none).
- Writes go through `withTx` and record `audit_log` when `actorId` is given.

### 2. `src/lib/server/modules/entitlements/`

`createEntitlementService({ db, catalog, log })`:
- `grant({ userId, productId, source, orderItemId?, actorId?, tx? })` → returns the active
  entitlement; if one exists it is returned unchanged (idempotent); inside the same transaction
  `syncIsMember(userId)`.
- `revoke({ userId, productId, reason, actorId?, tx? })` and `revokeByOrderItems(orderItemIds[],
  reason, tx?)`; both set `revoked_at`, `revoke_reason`, then `syncIsMember`.
- `listForUser(userId)` (with product title/kind/slug), `ownedProductIds(userId)`,
  `hasAllAccess(userId)`, `accessibleLessonIds(userId)` (one query; all lessons when
  all-access), `syncIsMember(userId)` (`profiles.is_member = hasAllAccess`).
- `canAccessLesson(ctx: { profile, accessibleLessonIds, isAdmin }, lesson: { id, isFreePreview }): boolean`
  (pure): free preview → true; no profile or suspended → false; admin → true; otherwise id in
  the set.
- `lockState(ctx, lesson)` → `'open' | 'locked' | 'suspended'` for list pages.

### 3. Access on the request

`create-handle.ts`: after the profile is loaded, `locals.access.allAccess = await entitlements.hasAllAccess(user.id)`
(false when signed out). `modules/auth/access.ts` gains `requireActiveMember(event, redirectTo)`
= signed-in, not suspended, `allAccess || ownedProductIds.length > 0` (an owner of anything),
redirecting signed-out users to sign-in and others to `/catalogue`. `tests/routes/hooks.test.ts`
gains a case: a user with an active all-access entitlement gets `access.allAccess = true`.

### 4. Validation schemas (`src/lib/shared/schemas/catalog.ts`)

Product input (kind picklist, slug, title 1–120, tagline ≤ 200, descriptionMd ≤ 20 000,
coverImageUrl https, price integer 30..10 000 000, salePrice optional < price, sale window
dates, flags, sortOrder).

### 5. Wiring and helpers

`Services` gains `catalog` and `entitlements`; `tests/helpers/services.ts` extended;
`tests/helpers/fixtures.ts`: `seedCatalog(db)` creating a flagship, one bundle of two lessons,
one single, three users (all-access member via entitlement, bundle owner, nobody) for reuse by
later route tests.

### 6. Tests

`catalog/pricing.test.ts` (sale windows: before, inside, after, open-ended, no sale);
`catalog/service.test.ts` (second `access_scope = 'all'` refused; `setItems` rules per kind;
checklist lists each unmet condition and `publish` refuses; `cheapestProductForLesson` picks
the cheaper of two bundles and falls back to the flagship; `remove` refuses with history;
`audit_log` written with actor); `entitlements/service.test.ts` (grant idempotent; partial
unique respected; revoke then grant again creates a second row; `accessibleLessonIds` for
all-access = every published lesson id incl. one created after the grant; for a bundle owner =
the bundle's lessons only; `canAccessLesson` matrix: free preview/anonymous, suspended owner,
admin without entitlement, owner, non-owner; `is_member` flips true on grant and false on
revoke of the flagship, unaffected by bundle grants).

Out of scope: orders, payments, UI.

## Steps

1. Catalog pricing + service + schemas + tests, commit.
2. Entitlements service + tests, commit.
3. Hook `allAccess`, `requireActiveMember`, fixtures, hook test, commit.
4. Gate once.

## Definition of Done

- [ ] Exactly one flagship is enforced in code and tested; `setItems` kind rules tested.
- [ ] `publishChecklist` returns the six named conditions when unmet (test enumerates them).
- [ ] `grant` is idempotent and `revoke` sets `revoked_at`; the partial unique index is exercised (grant, revoke, grant → two rows, one active).
- [ ] `accessibleLessonIds` for all-access includes a lesson published after the grant (test).
- [ ] `profiles.is_member` is updated by `grant`/`revoke` of the flagship only (test asserts both directions and the bundle case).
- [ ] `locals.access.allAccess` is set in the hook pipeline (hook test).
- [ ] `canAccessLesson` is pure (no `db` argument) and its matrix test has the five rows.
- [ ] Gate green.
