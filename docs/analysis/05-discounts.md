# 05 — Discount codes per product

Decision (2026-10-18): keep the in-house promo engine, applied on our checkout page before Stripe,
but make every code scoped to one product, a set of products, or all products. Stripe Coupons are
not used as the source of truth.

## What exists today

- One `pricing_config` row (£149) and a `promo_codes` table with `discount_type`
  (`percentage` | `fixed`), `discount_value` (whole percent or pence), `max_uses`, `current_uses`,
  `valid_from`, `valid_until`, `is_active`, `min_purchase_amount` (unused).
- Applied via a 1-hour `promo_code_id` cookie; validity re-checked on the checkout action with a
  single predicate (`promoValidity`); `calculateDiscount` caps the discount at the base price; a
  30p Stripe minimum is enforced; usage incremented by `increment_promo_code_usage` after payment.
- Admin: create (code, type, value, max uses, valid until, description) and toggle active. No edit,
  no per-user limit, no scoping, no redemption list.

## Target model

```
products ──< promo_code_products >── promo_codes ──< promo_redemptions >── orders
```

### `promo_codes` (extended)

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| code | text unique | stored upper-case, `^[A-Z0-9_-]{2,32}$` |
| description | text | internal note |
| discount_type | enum `percentage` / `fixed` | |
| discount_value | integer | percent 1–99, or pence ≥ 1 |
| applies_to | enum `all` / `products` | `products` requires rows in `promo_code_products` |
| min_subtotal | integer null | pence; eligible-items subtotal must reach it |
| max_redemptions | integer null | total cap (replaces `max_uses`) |
| max_redemptions_per_user | integer null | typical value 1 |
| starts_at / ends_at | timestamptz | `ends_at` null = open-ended |
| is_active | boolean | admin kill switch |
| created_by | uuid → users | |
| created_at / updated_at | timestamptz | |

`current_uses` goes away: usage is `count(*) from promo_redemptions where promo_code_id = ?`, which
is exact under concurrency and supports per-user limits.

### `promo_code_products`

`(promo_code_id, product_id)` primary key. A code with `applies_to = 'products'` and zero rows is
invalid (admin validation prevents saving it).

### `promo_redemptions`

| column | notes |
|---|---|
| id | |
| promo_code_id | |
| order_id | unique: one code per order |
| user_id | for the per-user cap |
| discount_total | pence actually taken off |
| created_at | |

Inserted in the same transaction as the `orders` row when the Checkout Session is created, with
status following the order (a redemption on an order that expires unpaid is released by the
expiry job, see below).

### Automatic sale prices (no code)

Independent of codes, `products.sale_price` + `sale_starts_at` + `sale_ends_at` give the admin a
time-boxed sale without handing out a code. The catalogue shows the struck-through list price.
Codes apply on top of the sale price unless `promo_codes.stackable_with_sale = false` (default
false: a code never stacks on a discounted item; the better of the two is used).

## Cart arithmetic

Only one code per cart (simplest to explain to buyers and to refund).

1. Resolve the cart to line items: `{ product, list_price, effective_price }` where
   `effective_price` is the sale price when a sale is live.
2. Eligible lines: all lines when `applies_to = 'all'`, otherwise lines whose product is in
   `promo_code_products`. Lines already owned by the buyer are removed from the cart before this
   step (see `03-architecture.md`, cart rules).
3. `eligible_subtotal = Σ effective_price` of eligible lines. If `min_subtotal` is set and not
   reached → code rejected with a message naming the threshold.
4. Discount:
   - percentage: `discount_i = round(effective_price_i × pct / 100)` per eligible line;
   - fixed: `D = min(discount_value, eligible_subtotal)`, distributed pro rata:
     `discount_i = floor(D × effective_price_i / eligible_subtotal)` and the rounding remainder
     (in pence) added to the most expensive eligible line, so `Σ discount_i = D` exactly.
5. Per-line `unit_amount = effective_price_i − discount_i`. A line that would fall below 30p is
   clamped to 30p and the difference is dropped (Stripe minimum). If *every* line is zero (100%
   code, only allowed for `percentage` ≤ 99 anyway) the code is rejected.
6. Totals stored on the order: `subtotal`, `discount_total`, `total`, and on each `order_items`
   row: `list_price`, `unit_price`, `discount_amount`. These snapshots make per-item refunds and
   accounting possible regardless of later price changes.

Pure functions, unit-tested with a table of cases (percent rounding, pro-rata remainder, Stripe
minimum, non-eligible lines, owned-items removal, sale + code interplay). The existing
`calculateDiscount` test file is the seed for this.

## Stripe

Line items are passed as `price_data` with the already-discounted `unit_amount`, exactly like
today, one line per product, `quantity: 1`. Two optional refinements:

- `custom_text.submit` or a line `description` such as “Promo SPRING20 applied (−£12.00)” so the
  Stripe page shows the code.
- For nicer receipts, create a one-off Stripe Coupon per order (`amount_off: discount_total`,
  `duration: 'once'`, `name: code`) and pass full-price lines plus `discounts: [{ coupon }]`. The
  Stripe receipt then shows list price and discount as separate lines. Cost: one extra API call and
  a coupon object per discounted order. Recommended once the basic flow is live.

The Checkout Session carries `client_reference_id = order.id` and `metadata.order_id`; the webhook
reads nothing else. Idempotency key for `sessions.create` = order id.

## Validity predicate (server, single source of truth)

```
is_active
AND starts_at <= now()
AND (ends_at IS NULL OR ends_at > now())
AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
AND (max_redemptions_per_user IS NULL OR user_redemptions_count < max_redemptions_per_user)
AND (applies_to = 'all' OR cart has at least one eligible line)
AND (min_subtotal IS NULL OR eligible_subtotal >= min_subtotal)
```

Evaluated when the code is applied (to show the price) and again inside the checkout transaction
(to decide). The redemption insert happens in that transaction with the code row locked
(`SELECT ... FOR UPDATE`) so the cap cannot be exceeded.

Unpaid orders: a scheduled job (Vercel Cron, every 15 min) marks orders `expired` when the Stripe
session has expired (`expires_at`, default 24h; set it to 1h for this shop) and deletes their
redemption rows so the code becomes usable again.

## Admin UI

Route group `/admin/promotions`:

- List: code, scope (All / 3 products), value, redemptions `12 / 50`, window, status; filters
  active / scheduled / expired.
- Create / edit form: code (auto-generate button), type, value, scope picker (radio All products /
  Selected products with a searchable multi-select of published products), limits (total, per
  user), window (date-time pickers, timezone shown), minimum subtotal, description, active.
  Validation mirrors the server rules; messages name the field.
- Detail: redemption table (order, buyer email, discount, date) with CSV export (properly quoted).
- Bulk generate: N single-use codes with a prefix (`GIFT-XXXX`) for giveaways; each row has
  `max_redemptions = 1`.
- Deactivate instead of delete when redemptions exist (the order history references the code).

Product pages in admin show “Active promotions for this product” read-only, linking back.

## Buyer UX

- Promo field in the cart drawer and on the checkout page; applying shows per-line savings and the
  new total; errors are specific (“This code is for the Zippers bundle only”, “Expired on 3 Oct”,
  “Already used on this account”).
- The code is stored in the server-side cart (signed cookie) and re-validated on every render, so a
  code that expires while the buyer thinks about it disappears with an explanation rather than
  failing at Stripe.
- Marketing links `?promo=CODE` pre-apply the code (rate-limited, no enumeration feedback beyond
  valid / invalid).

## Migration from the current table

Additive SQL:

1. Add `applies_to default 'all'`, `max_redemptions`, `max_redemptions_per_user`, `starts_at`
   (copy from `valid_from`), `ends_at` (copy from `valid_until`), `min_subtotal`
   (copy from `min_purchase_amount`).
2. Create `promo_code_products`, `promo_redemptions`.
3. Backfill `promo_redemptions` from `payments` rows with `promo_code_id`, linked to the
   back-filled `orders` rows (one per payment).
4. Keep `current_uses`/`max_uses` until the old branch is retired, then drop.

## Edge cases to test

- Same code applied twice in one cart → single redemption, idempotent apply.
- Code valid for a product the buyer already owns → “nothing in your cart is eligible”.
- Code applied, then an item removed making the subtotal fall under `min_subtotal` → code removed
  with a message.
- Cap reached between apply and pay → checkout returns the cart with the code removed, not a 500.
- Refund of an order with a code → redemption stays (history) but is flagged `refunded`; the cap is
  not released (business choice; make it a setting if the owner disagrees).
- Case-insensitive input, surrounding whitespace, lookalike characters are normalised before lookup.
