# PHASE-15 — Fulfilment, Stripe webhooks, refunds, emails, scheduled jobs

## Why

A paid session must grant exactly the entitlements of exactly one order, once, whether the
webhook or the success page gets there first; a refund or dispute must take them away
(`02-security-audit.md` M3). `fulfilOrder` is the single place that grants access.

## Read first

`legacy/src/routes/api/stripe/webhook/+server.ts`, `legacy/src/lib/server/membership.ts`
(ownership and idempotency reasoning to preserve); `docs/analysis/03-architecture.md` → Purchase
flow, Refund flow; entry file → Domain facts (Stripe events); `src/lib/server/modules/commerce/orders.ts`
and `src/lib/server/platform/stripe.ts` + fake.

## Deliverables

### 1. `src/lib/server/modules/commerce/fulfilment.ts`

`createFulfilmentService({ db, orders, entitlements, auth, catalog, mailer, gateway, log, siteUrl })`:
- `fulfilOrder(orderId, session: CheckoutSessionView)`: in `withTx`: load order `FOR UPDATE`;
  if `paid` → `{ alreadyFulfilled: true }`; require `session.paymentStatus === 'paid'`,
  `session.clientReferenceId === orderId`, `session.amountTotal === order.total` and matching
  currency (mismatch → throw `FULFILMENT_MISMATCH`, nothing written); set `paid`, `paid_at`,
  `stripe_payment_intent_id`; `profiles.stripe_customer_id` when present; `entitlements.grant`
  per item (`source 'purchase'`, `orderItemId`); `auth.markEmailVerified(userId)` when
  `session.customerEmail` equals the user's email case-insensitively. After commit: send
  `orderConfirmationEmail`; `welcomeEmail` too when this is the user's first paid order. Return
  `{ fulfilled: true, firstFulfilment: true }`. Email failures are logged, never thrown.
- `revokeOrder(orderId, { kind: 'refund' | 'partial_refund' | 'dispute', amountRefunded? })`:
  `entitlements.revokeByOrderItems` (all items; partial refunds still revoke everything and set
  `order_items.refunded_amount` pro rata, a documented business rule), order status
  `refunded | partially_refunded | disputed`, then `accessRevokedEmail`.
- `handleGatewayEvent(event: GatewayEvent)`: insert `webhook_events (provider 'stripe',
  event_id)`; on conflict → return `{ duplicate: true }`; dispatch by type:
  `checkout.session.completed` → paid ? `fulfilOrder` : no-op (delayed methods);
  `checkout.session.async_payment_succeeded` → `fulfilOrder`;
  `checkout.session.async_payment_failed` and `checkout.session.expired` → `orders.expire`;
  `charge.refunded` → `revokeOrder` (full when `amount_refunded === amount`, else partial);
  `charge.dispute.created` → `revokeOrder({ kind: 'dispute' })`; unknown order → record
  `error` on the event row, return normally. Set `processed_at` or `error` on the row after
  handling.

### 2. Routes

- `src/routes/api/webhooks/stripe/+server.ts`: raw body, `stripe-signature` header,
  `gateway.constructEvent` (400 `{ error }` on failure), `handleGatewayEvent`; `200 { received: true }`;
  handler exceptions → 500 so Stripe retries. `export const config = { maxDuration: 60 }`.
  Logs event id and type only.
- `/checkout/success` (PHASE-14) now calls `fulfilOrder` when the retrieved session is paid,
  before rendering; errors are logged and the page still renders the “finalising” state.
- `src/routes/api/jobs/expire-orders/+server.ts` and `api/jobs/sync-media/+server.ts`: GET,
  require `Authorization: Bearer <CRON_SECRET>` (401 otherwise), run `orders.expireStale(now)`
  / `media.syncProcessing({ olderThanMinutes: 30 })`, return counts. `vercel.json`:
  `{ "crons": [ { "path": "/api/jobs/expire-orders", "schedule": "*/15 * * * *" }, { "path": "/api/jobs/sync-media", "schedule": "0 * * * *" } ] }`.

### 3. Tests

`fulfilment.test.ts` (PGlite, fakes): fulfil grants one entitlement per item and sets `paid`;
calling twice grants nothing new and sends one confirmation; amount mismatch throws and writes
nothing; email verified only when addresses match; first order sends welcome + confirmation,
second order only confirmation; full refund revokes all and sets `refunded`; partial sets
`partially_refunded`, still revokes, pro-rata `refunded_amount`; dispute → `disputed`;
`handleGatewayEvent` duplicate event id → `{ duplicate: true }` and no second grant; unknown
order → event row with `error`; `async_payment_failed` expires and releases the promo.
`tests/routes/stripe-webhook.test.ts`: bad signature (fake told to throw) → 400; valid
completed event → 200 and order paid; handler throwing → 500. `tests/routes/jobs.test.ts`:
401 without the secret, counts with it. `checkout-success.test.ts` extended: paid session →
order fulfilled on page load.

Out of scope: admin re-run fulfilment UI (PHASE-16), Stripe Tax, invoices beyond the flag set
in PHASE-06.

## Steps

1. Fulfilment service + tests, commit.
2. Webhook endpoint + success page call + tests, commit.
3. Jobs + `vercel.json` + tests, commit.
4. Wiring, gate once.

## Definition of Done

- [ ] `fulfilOrder` is the only writer of `source = 'purchase'` entitlements (grep for `'purchase'` under `src/`) and locks the order row (`FOR UPDATE` present).
- [ ] The double-call test shows one entitlement per item and one confirmation email; the mismatch test shows no writes.
- [ ] `webhook_events` is written before dispatch and the duplicate test proves the second delivery is a no-op.
- [ ] All six event types are handled and tested; refund and dispute revoke access (tests).
- [ ] The webhook endpoint returns 400 on a bad signature, 500 on handler failure, 200 otherwise (tests); it logs no email addresses (reviewer reads it).
- [ ] Job endpoints require `CRON_SECRET` (test); `vercel.json` has both cron entries.
- [ ] Gate green.
