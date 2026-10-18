# PHASE-14 — Checkout and orders: account step, pending order, Stripe Checkout Session, success/cancel

## Why

Turning a cart into money. The order is created first, in a transaction with its items and the
promo reservation, then a Stripe Checkout Session is created with an idempotency key equal to
the order id and the buyer is redirected. Accounts are created at checkout as legacy does, but
unverified (`02-security-audit.md` H3), and never with admin side effects (H4).

## Read first

`legacy/src/routes/checkout/+page.server.ts`, `legacy/src/routes/checkout/+page.svelte`,
`legacy/src/routes/checkout/success/**`, `legacy/src/routes/checkout/cancel/**`;
`docs/analysis/03-architecture.md` → Purchase flow, Account step; `docs/analysis/05-discounts.md`
→ Stripe; `src/lib/server/platform/stripe.ts` + fake (PHASE-06); `src/lib/server/modules/commerce/`
(PHASE-12); `src/lib/server/modules/auth/service.ts`.

## Deliverables

### 1. `src/lib/server/modules/commerce/orders.ts`

`createOrderService({ db, cart, promo, catalog, gateway, log, siteUrl, now? })`:
- `createPendingOrder({ userId, state, viewer })` in `withTx`: `cart.quote`; refuse empty or
  rejected-promo carts (`EMPTY_CART`, `PROMO_INVALID` with the reason); insert `orders`
  (`pending`, `expires_at = now + 1h`, snapshots) and `order_items` (title, list/unit price,
  discount), `promo.reserveRedemption` when a code applies; return the order with items.
- `startCheckout(orderId, { customerEmail })` → `gateway.createCheckoutSession({ orderId,
  lineItems from items (name = title, unitAmount, quantity 1, description with the code when
  discounted), successUrl = `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl = `${siteUrl}/checkout/cancel?order=<id>`, expiresAt = order.expires_at, metadata {
  order_id } })` → store `stripe_checkout_session_id`; returns the URL. Idempotent: a second
  call for an order that already has a session returns the stored session's URL via
  `retrieveCheckoutSession`.
- `getById`, `getByCheckoutSession(sessionId)`, `listForUser(userId)`,
  `expire(orderId)` (only from `pending`; releases the redemption), `expireStale(now)` (cron,
  PHASE-15 wires the endpoint), `cancelPending(orderId, userId)` (buyer backs out → `expired`).
- `ownerOf(order, viewer)` and `summaryForSuccessPage(order)`.

### 2. Routes (`src/routes/(shop)/checkout/`)

- `/checkout` load: quote; empty → redirect `/cart`; signed-in buyer sees the summary and a
  single “Pay with Stripe” button; signed-out buyer sees the legacy account form (full name,
  email, password) plus the Google button (when configured) with `redirectTo=/checkout`.
- Action `checkout`: signed-out → validation as legacy; existing email → `fail(400)` “already
  registered, please sign in” (the claim-by-code flow is PHASE-20); otherwise
  `auth.createCredentialUser` (unverified) then `signInEmail`; then `createPendingOrder`,
  `startCheckout`, and `redirect(303, url, { external: true })`. Service errors map to
  `fail(400/409)` with the user-facing messages from `05-discounts.md`; gateway errors →
  `fail(502, …)` and the order is expired. No `ADMIN_EMAIL` logic anywhere.
- `/checkout/success?session_id=`: `gateway.retrieveCheckoutSession`; order by
  `clientReferenceId`/metadata; if a viewer is signed in and is not the order's owner →
  `error(403, …)` (legacy message); render the order summary and status: `paid` → “you now
  own …” with library links; `pending` with `paymentStatus === 'paid'` → “finalising…” and a
  `<meta http-equiv="refresh" content="3">` (fulfilment arrives in PHASE-15 and will also run
  here); unpaid → link back to `/cart`. Clears the cart cookie when the session is paid.
- `/checkout/cancel?order=`: `cancelPending` when the viewer owns it; copy from legacy.

### 3. Tests

`orders.test.ts` (PGlite + fake gateway): `createPendingOrder` snapshots prices and reserves the
redemption in one transaction (force a failure after the insert → nothing persisted); empty
cart refused; `startCheckout` passes `orderId` as idempotency key and `metadata.order_id`,
stores the session id, and is idempotent; `expire` releases the redemption and refuses from
`paid`; `expireStale` expires only `pending` orders past `expires_at`.
`tests/routes/checkout.test.ts`: signed-out valid form → user created with `email_verified =
false`, order pending, redirect to the fake Stripe URL; duplicate email → 400 and no order;
signed-in → no account form, redirect; empty cart load → redirect `/cart`.
`tests/routes/checkout-success.test.ts`: another signed-in user → 403; owner with a paid fake
session → summary, cart cookie cleared.

Out of scope: webhook, fulfilment, emails, refunds (PHASE-15), 2FA/OTP claim (PHASE-20).

## Steps

1. Orders service + tests, commit.
2. Checkout page + action + tests, commit.
3. Success + cancel pages + tests, commit.
4. Wiring (`Services.commerce.orders`), gate once.

## Definition of Done

- [ ] `createPendingOrder` is atomic (the forced-failure test shows no `orders`, `order_items` or `promo_redemptions` rows).
- [ ] The checkout redirect to Stripe uses `redirect(303, url, { external: true })` (grep) and the session is created with `idempotencyKey === order.id` (fake gateway records it; test).
- [ ] `grep -rn "ADMIN_EMAIL\|is_admin" src/routes/\(shop\)` returns nothing; accounts created at checkout have `email_verified = false` (test).
- [ ] The success page refuses a session that belongs to another signed-in user with 403 (test).
- [ ] `expire`/`expireStale` release redemptions and never touch paid orders (tests).
- [ ] Gate green.
