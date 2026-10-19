# Architecture

Skyler's Sewing Secrets v2 as built: a SvelteKit 3 app on Vercel (Node 24 functions) with one
Postgres database on Neon, Stripe Checkout for payments, Bunny Stream for video, Resend for
email and Better Auth for accounts. It replaced the legacy app by sharing its database and adding
tables and columns, never removing them (`docs/runbooks/launch.md`). The reasoning behind the
choices is in `docs/analysis/03-architecture.md`; security settings are in `docs/SECURITY.md`;
day-to-day operations in `docs/runbooks/operations.md`.

## Layout

```
src/env.ts                    every environment variable, declared once (defineEnvVars)
src/params.ts                 route param matchers (uuid, slug)
src/hooks.server.ts           Sentry handle + createHandle() wired to the runtime container
src/lib/shared/               isomorphic: money (pence ↔ £), slugs, dates, lesson paths, valibot schemas
src/lib/components/           ui, layout, marketing, shop, course, admin (Svelte 5, runes)
src/lib/server/runtime/       env.ts (the only $app/env/private reader), container.ts (getServices)
src/lib/server/db/            createDb (Neon or PGlite), Db/Tx types, withTx, schema/**, backfill/**
src/lib/server/platform/      adapters: Stripe, Bunny Stream, Bunny Storage, Resend, Turnstile,
                              revalidation, logger, request limits; in-memory fakes under fakes/
src/lib/server/http/          hook pipeline, security headers, maintenance, shared route helpers
src/lib/server/modules/       auth, media, content, catalog, entitlements, commerce, marketing, admin
src/routes/                   (marketing) (shop) (member) (auth) admin/ api/
drizzle/                      migrations; 0000/0001 are the legacy baseline, 0002+ are v2's
scripts/                      tsx CLIs: backfill, seed-dev, check-env
tests/                        PGlite-backed route/service tests, helpers, e2e/ (Playwright)
```

Routes are thin: they parse input with a schema from `src/lib/shared/schemas/`, check access,
call one service from `event.locals.services` and map the result to data, `fail()` or
`redirect()`. No route imports Drizzle.

## Composition root

`getServices()` (`src/lib/server/runtime/container.ts`) builds every service once per function
instance from `getRuntimeConfig()` (`runtime/env.ts`) and caches it. Production always wires the
real adapters (Stripe, Bunny Stream and Storage, Resend, Turnstile when configured, ISR
revalidation when a bypass token is set). Tests build the same services on PGlite with the fakes
from `platform/fakes/` through `tests/helpers/services.ts`; no test touches the network.

Services are factories with explicit dependencies, for example
`createCatalogService({ db, content, log })`. A module imports another only through its
`index.ts`.

| Module | Owns | Depends on |
| --- | --- | --- |
| `auth` | Better Auth instance (`createAuth`), accounts and profiles (`createAuthService`: credential users, suspension, admin flag, export, GDPR anonymisation), TOTP (`createTwoFactorService`), access helpers (`requireUser`, `requireAdmin`, `resolveAccess`) | — |
| `media` | `media_assets`; Bunny upload tickets, webhook intake, sync of stuck videos | `VideoHost` |
| `content` | modules, lessons, resources, progress, course outline; Markdown → sanitised HTML (`markdown.ts`) | — |
| `catalog` | `products`, `product_items`, pricing and sale windows, publish checklist, lesson search | `content` |
| `entitlements` | who owns what; `canAccessLesson`, `accessibleLessonIds`, grant/revoke, `is_member` sync | — |
| `commerce` | signed cart cookie, promo engine, orders and Stripe Checkout, fulfilment, refunds, disputes, expiry | `catalog`, `entitlements`, `auth`, marketing emails, `PaymentGateway`, `Mailer` |
| `marketing` | blog, FAQ, testimonials, contact, newsletter, site settings, email templates | `content` |
| `admin` | dashboard, users, orders, audit log, uploads | `auth`, `catalog`, `commerce`, `entitlements` |

Every admin mutation writes `audit_log` in the same transaction. Multi-row writes run in one
`withTx`; email, Stripe and Bunny calls happen after commit.

## Request pipeline

`src/hooks.server.ts` runs `sequence(Sentry.sentryHandle(), createHandle(…))`; Sentry is inert
without `SENTRY_DSN`. `createHandle` (`src/lib/server/http/create-handle.ts`) is:

1. **security headers**: `locals.requestId` (also the `X-Request-Id` response header),
   `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS on https. The
   CSP is SvelteKit's nonce mode, configured in `vite.config.ts` (frames only from
   `iframe.mediadelivery.net`).
2. **dispatch**: `locals.services = await getServices()`, `locals.log` = a logger bound to the
   request id. `/api/auth/*` goes straight to Better Auth's SvelteKit handler.
3. **session**: Better Auth `getSession`, then the profile (`ensureProfile` when missing), then
   `entitlements.hasAllAccess`, giving `locals.user`, `locals.profile` and
   `locals.access = { isAdmin, isSuspended, allAccess }`. A suspended account is neither member
   nor admin.
4. **maintenance gate**: while `site_settings.maintenance_mode` is on, reads redirect to `/` and
   writes get 503, except the exempt paths in `http/maintenance.ts` (admin, auth, webhooks, the
   `CRON_SECRET`-protected jobs, health and the Stripe return pages).
5. **admin gate**: `/admin/**` needs an active admin with TOTP on; one without it is sent to
   `/admin/security?required=1`.

Every load, action and endpoint still checks access itself (`requireUser`, `requireAdmin`,
`canAccessLesson`); the gates are a second line.

## Data model

Legacy tables (created by `drizzle/0000_init.sql`, shared with the legacy app) keep their names
and columns; v2 adds tables and nullable or defaulted columns (`drizzle/0002+`).

| Area | Tables | Notes |
| --- | --- | --- |
| Accounts | `users`, `sessions`, `accounts`, `verifications` (legacy); `two_factors`, `rate_limits` (v2) | bcrypt hashes in `accounts.password` (credential provider), same user ids as before |
| Profiles | `profiles` (legacy) | `is_admin`, `is_suspended`; `is_member` kept in sync for the legacy app |
| Content | `modules`, `lessons`, `lesson_resources`, `user_progress` (legacy) | lessons gained `kind` (`video`/`article`), `media_asset_id`, `content_md/html`; `module_id IS NULL` = standalone video |
| Media | `media_assets` (v2) | one Bunny video: `library_id`, `video_id`, status `uploading → processing → ready / failed` |
| Catalogue | `products`, `product_items` (v2) | `kind` `course`/`bundle`/`single`; `access_scope` `all` (the one flagship course: every lesson, current and future) or `items` (the lessons in `product_items`); prices in pence |
| Commerce | `orders`, `order_items`, `promo_code_products`, `promo_redemptions` (v2); `promo_codes` (legacy, extended) | order status `pending`, `paid`, `expired`, `refunded`, `partially_refunded`, `disputed`; items snapshot the price paid |
| Ownership | `entitlements` (v2) | `source` `purchase`/`migration`/`admin_grant`/`gift`, `order_item_id`, `revoked_at`; at most one active row per user and product |
| Operations | `webhook_events`, `audit_log`, `request_limits` (v2); `site_settings` (legacy) | `webhook_events` is unique on `(provider, event_id)` |
| Marketing | `blog_posts`, `testimonials`, `faq_items`, `contact_submissions`, `newsletter_subscribers` (legacy) | Markdown stored with its sanitised `*_html` |
| Retired later | `pricing_config`, `payments` and the legacy columns in `docs/runbooks/retire-legacy.sql` | read only by the backfill |

## Access resolution

`canAccessLesson` (`modules/entitlements/service.ts`) decides, in order:

1. a free-preview lesson is open to everyone;
2. no profile, or a suspended one: no access;
3. an admin: access;
4. otherwise the lesson must be in `accessibleLessonIds(user)`: every lesson when the user holds an
   active entitlement to an `access_scope = 'all'` product, else the lessons in `product_items` of
   the products they hold active entitlements to.

Lesson pages (`/modules/[module]/[lesson]`, `/videos/[slug]`) go through `lessonPage`
(`http/member-area.ts`): a suspended account gets 403; a locked lesson renders only its unlock
offers (the cheapest product containing it and the flagship); an open video lesson gets a signed
Bunny embed URL, `https://iframe.mediadelivery.net/embed/{library}/{video}?autoplay=false&preload=true&token=sha256hex(key + videoId + expires)&expires=…`,
valid for six hours. Without `BUNNY_EMBED_TOKEN_KEY` playback fails closed.

## Purchase flow

1. **Cart**: a signed `cart` cookie holding product ids and an optional promo code
   (`commerce/cart.ts`); `/cart` actions add, remove, apply or remove a code. Products the
   viewer already owns, and those the flagship includes, drop out of the quote.
2. **Checkout** (`/checkout`): a signed-out buyer gives a name, email and password; the action
   creates the credential account (`auth.createCredentialUser`, email unverified) and signs it in.
   An unverified account with no orders can instead be claimed with a six-digit emailed code.
3. **Order**: `orders.createPendingOrder` re-prices the cart and, in one transaction, writes a
   `pending` order (expires in one hour), its items and the promo reservation.
   `orders.startCheckout` creates the Stripe Checkout Session (`mode: 'payment'`, GBP,
   `client_reference_id` and `metadata.order_id` = the order id, idempotency key = the order id)
   and redirects to it.
4. **Webhook** (`/api/webhooks/stripe`): the signature is verified (400 otherwise), then
   `fulfilment.handleGatewayEvent` records the event in `webhook_events` (`ON CONFLICT DO NOTHING`;
   a repeat is a no-op unless the earlier attempt failed, or was never marked processed and is older
   than the two-minute in-flight window, i.e. that invocation died). `checkout.session.completed` with
   `payment_status = 'paid'` and `checkout.session.async_payment_succeeded` run `fulfilOrder`: lock
   the order, check reference, amount and currency, mark it `paid`, grant one `purchase`
   entitlement per item, sync `is_member`, and after commit send the receipt (plus a welcome email
   on the first order). `async_payment_failed` and `checkout.session.expired` expire the order and
   release its promo reservation.
5. **Success page** (`/checkout/success?session_id=…`) fulfils idempotently from the session as
   well, so the buyer sees their purchase even if the webhook is late, and clears the cart.
6. **Expiry**: the `/api/jobs/expire-orders` cron (every 15 minutes, `Authorization: Bearer
   CRON_SECRET`) expires stale pending orders.

## Refunds and disputes

`charge.refunded` revokes the order as `refund` or `partial_refund` and `charge.dispute.created`
as `dispute` (`fulfilment.revokeOrder`): the order status changes, refunded amounts are spread
over the items, and `entitlements.revokeByOrderItems` sets `revoked_at` on every entitlement the
order granted (a partial refund removes all access, by business rule). `is_member` is re-synced
and the buyer is emailed after commit. Refunds are issued in the Stripe dashboard.

## Media

The admin uploads from the browser straight to Bunny over TUS: `POST /admin/api/upload-ticket`
calls `media.createUpload`, which creates the Bunny video and an `uploading` asset and returns the
presigned headers (`/reissue` renews them). `/api/webhooks/bunny` accepts only the configured
library, records `{guid}:{status}` in `webhook_events` and re-fetches the video from the Bunny API
before changing the asset's status. The hourly `/api/jobs/sync-media` cron re-syncs assets still
uploading or processing after 30 minutes.

## Authentication

Better Auth (`modules/auth/create-auth.ts`) on the legacy tables: bcrypt `hash`/`verify` so
migrated passwords keep working, `emailAndPassword.disableSignUp` (accounts come from checkout and
Google), password reset revokes sessions, Google sign-in when both keys are set (account linking
trusts Google), the `twoFactor` plugin (TOTP, required for admins) and `emailOTP` for the checkout
claim code, and a database-backed rate limit. Admins cannot sign in through Google or a code.

## Testing

`npm test` runs Vitest on PGlite with every migration applied (`tests/helpers/db.ts`), using the
platform fakes. The Playwright suite in `tests/e2e/` runs against a deployed preview (Stripe test
mode, a Neon branch) from the CI `e2e` job when the repository variable `E2E_ENABLED` is `true`.
