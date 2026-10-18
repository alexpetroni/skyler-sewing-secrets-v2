# PHASE-12 — Pricing engine, scoped promo codes, signed cookie cart (services only)

## Why

The money math. Codes are scoped per product (owner decision), a cart holds several products,
and one validity predicate is used when a code is applied and when it is charged. Everything here
is deterministic and exhaustively unit-tested before any page or Stripe call exists.

## Read first

`docs/analysis/05-discounts.md` in full; `docs/analysis/03-architecture.md` → Cart rules;
`legacy/src/routes/checkout/+page.server.ts` (`promoValidity`, cookie handling),
`legacy/src/lib/server/stripe.ts` (`calculateDiscount` + test); schema `commerce.ts`
(PHASE-04); `src/lib/server/modules/{catalog,entitlements}`.

## Deliverables (`src/lib/server/modules/commerce/`)

### 1. `pricing.ts` (pure, no db)

Types `QuoteLine { productId, title, listPrice, effectivePrice, onSale, discount, unitAmount }`,
`Quote { lines, subtotal, discountTotal, total, promo: { code, id } | null, rejection: PromoRejection | null }`.
`computeQuote({ lines: { productId, title, listPrice, effectivePrice, onSale }[], promo?: PromoRule, now }): Quote`
implementing: eligibility (`applies_to` all/products), `min_subtotal`, percentage per line
`round(effectivePrice × pct / 100)`, fixed pro-rata with floor and remainder to the most
expensive eligible line, `stackable_with_sale = false` → on-sale lines excluded from code
eligibility, 30p floor per line (clamp, drop the difference), rejection when nothing is
eligible or everything would be zero. `Σ lines.unitAmount === total` always.

### 2. `promo.ts`

`createPromoService({ db, log })`: `normalizeCode(input)` (trim, upper, `^[A-Z0-9_-]{2,32}$`),
`findValidByCode(code, { userId?, productIds, eligibleSubtotal, now })` →
`{ ok: true, rule: PromoRule } | { ok: false, reason: PromoRejection }` with reasons
`not_found | inactive | not_started | expired | cap_reached | user_cap_reached | not_eligible | below_minimum`
(counts from `promo_redemptions` on orders with status in `pending|paid|refunded|partially_refunded|disputed`,
i.e. everything but `expired`); `reserveRedemption(tx, { promoCodeId, orderId, userId,
discountTotal, now })` locks the code row (`SELECT … FOR UPDATE`), recounts, inserts or throws
`cap_reached`/`user_cap_reached`; `releaseRedemption(tx, orderId)` deletes the row; admin
CRUD and `listRedemptions(codeId)` for PHASE-18 (`create`, `update`, `setProducts`,
`setActive`, `bulkGenerate({ prefix, count, ... })` with `max_redemptions = 1` each).

### 3. `cart.ts`

- Cookie codec: `serializeCart(state, secret)` / `parseCart(cookieValue, secret)` →
  `CartState { items: string[] (product ids, ≤ 10), promoCode: string | null }` as
  `base64url(json).hmacHex`; tampering or a bad signature → empty cart. Cookie name `cart`,
  `httpOnly`, `sameSite: 'lax'`, `secure` outside dev, 30 days, `path: '/'`.
- `createCartService({ db, catalog, entitlements, promo, log })`: `resolve(state, viewer, now)`
  → `{ lines, removed: { productId, reason: 'owned' | 'unpublished' | 'included_in_course' | 'duplicate' }[] }`
  applying: unpublished removed; products owned by the viewer removed; flagship present →
  every other line removed; dedupe; order preserved. `quote(state, viewer, now)` → `resolve` +
  `findValidByCode` + `computeQuote` + `suggestFlagship: boolean` (total ≥ 60% of the flagship
  price and flagship absent). Pure state helpers `addItem`, `removeItem`, `setPromo`, `clear`.

### 4. Schemas

`src/lib/shared/schemas/commerce.ts`: promo code input, product id, cart action payloads,
promo admin input (per `05-discounts.md` admin UI validation).

### 5. Wiring

`Services.commerce = { pricing (namespace of pure fns), promo, cart }`; test helpers extended.

### 6. Tests

`pricing.test.ts` — a table-driven suite covering at least: percentage rounding on odd prices;
fixed pro-rata with remainder lands on the most expensive line and sums exactly; fixed larger
than eligible subtotal is capped; non-eligible lines untouched; `stackable_with_sale` false
excludes sale lines and true includes them; 30p floor per line; `min_subtotal` unmet →
rejection `below_minimum`; all lines ineligible → `not_eligible`; no promo → totals equal
subtotal; `Σ unitAmount === total` asserted in every case.
`promo.test.ts` (PGlite) — every rejection reason reachable; valid code returned; cap: two
sequential reservations with `max_redemptions = 1` → second throws; per-user cap;
`releaseRedemption` makes the code usable again; expired orders do not count.
`cart.test.ts` — codec round-trip, tampered signature → empty, >10 items truncated; `resolve`
rules (owned, unpublished, flagship-removes-others, duplicate); `quote` applies a scoped code
to the right lines and sets `suggestFlagship`.

Out of scope: routes, Stripe, orders.

## Steps

1. `pricing.ts` + tests, commit.
2. `promo.ts` + tests, commit.
3. `cart.ts` + schemas + tests, commit.
4. Wiring, gate once.

## Definition of Done

- [ ] `pricing.test.ts` has at least 12 table rows covering every bullet above; every row asserts `Σ unitAmount === total`.
- [ ] `promo.test.ts` reaches all eight rejection reasons by name (grep the test for each literal).
- [ ] `reserveRedemption` uses `FOR UPDATE` (grep) and the sequential cap test proves the second reservation throws.
- [ ] `parseCart` returns an empty cart for a tampered value (test) and never throws.
- [ ] `resolve` removes owned items and everything else when the flagship is present (tests).
- [ ] No file in `modules/commerce/` imports `stripe` or `$app/*`.
- [ ] Gate green.
