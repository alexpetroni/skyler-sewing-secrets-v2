# PHASE-13 — Shop pages: catalogue, product page, cart, promo field, add-to-cart on locked lessons

## Why

Buyers need to see what is for sale and put several things in a cart before checkout (PHASE-14).
This phase is UI over the PHASE-08 catalog and PHASE-12 cart services; it also closes the loop
from a locked lesson to the cart.

## Read first

`docs/analysis/05-discounts.md` → Buyer UX; `docs/analysis/06-new-approaches.md` → Conversion;
`src/lib/components/marketing/Offer.svelte` and the UI kit; `src/lib/server/modules/commerce/cart.ts`;
`src/lib/components/course/LockedLesson.svelte` (PHASE-11).

## Deliverables

### 1. Components (`src/lib/components/shop/`)

`PriceTag` (list price struck through when on sale, “ends <date>”), `ProductCard` (cover,
kind badge, title, tagline, items/minutes, price, owned badge, add/“View”), `AddToCartButton`
(form posting to `/cart?/add` with `productId`, `enhance`d, disabled when owned or in cart),
`CartLines` (lines, remove buttons, per-line savings), `PromoField` (apply/remove with the
rejection message mapping from `05-discounts.md`), `CartSummary` (subtotal, discount, total,
`suggestFlagship` nudge, checkout button), `CartBadge` (header count). Legacy tokens only.

### 2. Routes (`src/routes/(shop)/`)

- `/catalogue`: published products grouped (flagship first, bundles, singles) with owned
  flags from `ownedProductIds`; empty state when only the flagship exists.
- `/products/[slug]`: product detail (description_html, included lessons with duration and
  free-preview links, price, add to cart or “you own this” → `/library`), 404 when unpublished.
  Flagship page lists the outline instead of items.
- `/cart`: load → `cart.quote(state, viewer, now)`; shows `removed` notices once (flash via
  the cookie state); actions `add` (`productId`; published only; `fail(400)` otherwise),
  `remove`, `applyPromo` (normalises, re-quotes; `fail(400, { promoError })` with the mapped
  message), `removePromo`, `clear`. Every action rewrites the signed cookie.
- Root `+layout.server.ts` returns `cartCount` from the parsed cookie (no DB); Header shows
  `CartBadge`.
- `LockedLesson.svelte` gains `AddToCartButton`s for the unlock options.
- `sitemap.xml` includes published product slugs.

### 3. Tests

`tests/routes/catalogue.test.ts` (grouping; owned flag for the bundle owner);
`tests/routes/product.test.ts` (404 unpublished; owned state); `tests/routes/cart.test.ts`
(add sets the cookie with one item; add unpublished → 400; add owned → cookie unchanged and
`removed` reason `owned` in the next quote; applyPromo invalid → `promoError` text; applyPromo
scoped code discounts only eligible lines; remove; clear); SSR tests for `PriceTag` (sale and
no-sale) and `CartSummary` (nudge shown when `suggestFlagship`).

Out of scope: checkout, Stripe, orders, admin.

## Steps

1. Components + SSR tests, commit.
2. Catalogue + product pages + tests, commit.
3. Cart page + actions + header badge + tests, commit.
4. Gate once.

## Definition of Done

- [ ] `/catalogue`, `/products/[slug]`, `/cart` exist with the actions named; every action validates with a schema from `src/lib/shared/schemas/commerce.ts` and calls the cart service (no pricing logic in routes).
- [ ] The cart cookie is `httpOnly`, `sameSite: 'lax'`, `path: '/'`, signed (reviewer reads the action code).
- [ ] `cart.test.ts` has the seven cases; `catalogue`, `product` and the SSR tests exist and pass.
- [ ] `LockedLesson.svelte` renders an add-to-cart form for each unlock option (SSR test updated).
- [ ] Header shows the cart count without a database query (`+layout.server.ts` parses the cookie only).
- [ ] Gate green.
