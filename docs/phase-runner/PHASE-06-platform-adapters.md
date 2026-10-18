# PHASE-06 — Platform adapters: Stripe, Bunny, Resend, logger, request limits, email templates

## Why

Commerce, media and admin phases need Stripe, Bunny Stream and Resend. The entry file requires
them behind interfaces with in-memory fakes so every later test runs without network and every
route depends on a type, not an SDK. The audit also requires a logger that never prints personal
data (M5) and a rate limiter that works on serverless (H5).

## Read first

`legacy/src/lib/server/stripe.ts`, `legacy/src/lib/server/bunny.ts` (+ its two tests),
`legacy/src/lib/server/email.ts` (+ test), `legacy/src/lib/server/newsletter.ts`,
`docs/analysis/04-admin-offers.md` → “Videos: Bunny Stream integration”;
`docs/analysis/05-discounts.md` → Stripe; entry file → Domain facts (Bunny, Stripe).

## Deliverables (`src/lib/server/platform/`)

### 1. `logger.ts`

`createLogger({ level, sink? })` → `Logger { debug, info, warn, error, child(bindings) }`
emitting one JSON line per call (`ts`, `level`, `msg`, bindings, fields) to `console.error`
(Vercel captures stderr) through an injectable sink. Redaction: any field named `email`,
`name`, `fullName`, `password`, `token`, `authorization`, `cookie` (case-insensitive, nested
one level) is replaced by `'[redacted]'`. `fakes/logger.ts` collects entries in an array.

### 2. `stripe.ts` — `PaymentGateway`

```ts
interface PaymentGateway {
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(id: string): Promise<CheckoutSessionView>;
  constructEvent(rawBody: string, signature: string): Promise<GatewayEvent>; // throws on bad signature
  createRefund(paymentIntentId: string, amountPence?: number): Promise<{ id: string }>;
}
```
`CheckoutSessionInput` carries `orderId`, `customerEmail`, `lineItems[{ name, description?,
unitAmount, quantity }]`, `successUrl`, `cancelUrl`, `expiresAt`, `metadata`;
`CheckoutSessionView` normalises `id`, `paymentStatus`, `status`, `amountTotal`, `currency`,
`customerEmail`, `paymentIntentId`, `customerId`, `metadata`, `clientReferenceId`.
`GatewayEvent` = `{ id, type, data }` with `data` typed per event family we handle.
`createStripeGateway({ secretKey, webhookSecret })` uses the `stripe` SDK: Checkout Session
with `mode: 'payment'`, `client_reference_id`, `metadata`, `customer_creation: 'always'`,
`invoice_creation: { enabled: true }`, no `payment_method_types`, `expires_at`,
`{ idempotencyKey: orderId }`; `constructEvent` → `webhooks.constructEventAsync`.
`fakes/payment-gateway.ts`: records sessions in a Map, `url = 'https://fake.stripe/' + id`,
`markPaid(id, overrides?)`, `constructEvent` parses JSON without signature checks and
`eventsFromSession(id, type)` builds a realistic event payload.

### 3. `bunny.ts` — `VideoHost`

```ts
interface VideoHost {
  embedUrl(ref: { libraryId: string; videoId: string }, ttlSeconds?: number): Promise<string>; // always signed
  listVideos(params: { page: number; perPage: number; search?: string }): Promise<{ items: BunnyVideo[]; total: number }>;
  getVideo(videoId: string): Promise<BunnyVideo>;
  createVideo(title: string): Promise<{ videoId: string }>;
  uploadTicket(videoId: string, ttlSeconds: number): Promise<UploadTicket>; // presigned TUS headers
  setThumbnail(videoId: string, thumbnailTime: number): Promise<void>;
  deleteVideo(videoId: string): Promise<void>;
}
```
`BunnyVideo` normalises `videoId`, `title`, `lengthSeconds`, `status` (0–6 mapped to the
`media_status` enum), `width`, `height`, `thumbnailUrl` (`https://{cdnHost}/{videoId}/{thumbnailFileName}`),
`dateUploaded`. `createBunnyVideoHost({ libraryId, apiKey, embedTokenKey, cdnHost, fetch })`:
the embed signature formula and TUS ticket formula from the entry file; `embedTokenKey` is
required (constructor throws when empty). `parseBunnyRef('bunny:lib/video')` ported from
legacy types. `fakes/video-host.ts`: in-memory library, deterministic ids, `finishEncoding(id)`.

### 4. `resend.ts` — `Mailer`

`Mailer { send(message: { to, subject, html, text, replyTo? }): Promise<{ id: string }> }`.
`createResendMailer({ apiKey, from, fetch })`: the legacy HTTP call, errors thrown (callers
decide), **no logging of addresses**. `fakes/mailer.ts` collects messages and exposes
`sent`, `lastTo(email)`.

### 5. `request-limits.ts`

`createRequestLimiter({ db })` → `consume(key: string, { max, windowSeconds }): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>`
implemented with one `INSERT ... ON CONFLICT (key) DO UPDATE` on `request_limits` that resets
the window when `window_start` is older than the window. `keyFor(prefix, event)` helper
hashing the client IP (`event.getClientAddress()` guarded) plus a scope.

### 6. Email templates (`src/lib/server/modules/marketing/emails.ts`)

Pure functions returning `{ subject, html, text }`, HTML-escaped as legacy
(`escapeHtml` moved to `src/lib/shared/html.ts`): `welcomeEmail(name)`,
`orderConfirmationEmail({ name, items: [{ title, pricePence }], totalPence, discountPence, libraryUrl })`,
`passwordResetEmail(url)`, `contactNotificationEmail(...)`,
`newsletterConfirmEmail(confirmUrl)`, `newsletterWelcomeEmail(unsubscribeUrl)`,
`accessRevokedEmail({ name, orderRef })`. Legacy wording and styling preserved where a legacy
template exists.

### 7. Wiring

`runtime/container.ts` builds the real adapters from `RuntimeConfig` (gateway, video host,
mailer, logger, limiter) and exposes them on `Services`; the console logger from PHASE-05 is
replaced.

### 8. Tests

`logger.test.ts` (redaction, child bindings, JSON shape); `bunny.test.ts` (embed URL equals
the legacy formula for a fixed time, port both legacy bunny tests; TUS ticket signature =
`sha256(lib + key + exp + id)`; `listVideos` maps a recorded Bunny response fixture; constructor
throws without `embedTokenKey`); `stripe.test.ts` (the fake: create → markPaid → retrieve
shows `paid`; `constructEvent` rejects malformed JSON; `eventsFromSession` has the fields the
webhook needs — the real gateway is covered only by a unit test of the input→Stripe params
mapping using a stubbed `stripe` client object injected through an optional constructor
parameter); `request-limits.test.ts` on PGlite (allow up to max, deny after, window reset
via an injected clock); `emails.test.ts` (every template escapes `<script>` in every
user-supplied field, text and html both contain the primary link).

Out of scope: webhook endpoints, media service, newsletter endpoints (later phases).

## Steps

1. Logger + fake, tests, commit.
2. Bunny adapter + fake + tests, commit.
3. Stripe adapter + fake + tests, commit.
4. Resend + emails + tests, commit.
5. Request limiter + test, commit.
6. Container wiring, gate once.

## Definition of Done

- [ ] The four interfaces (`PaymentGateway`, `VideoHost`, `Mailer`, `Logger`) are exported from `src/lib/server/platform/index.ts`; each has a real implementation and a fake under `platform/fakes/`.
- [ ] `createBunnyVideoHost` throws when `embedTokenKey` is empty; `embedUrl` output for a fixed clock equals the legacy expectation (test ported).
- [ ] `createStripeGateway` passes `client_reference_id`, `metadata.order_id`, `expires_at`, `customer_creation`, `invoice_creation` and an idempotency key equal to the order id; `payment_method_types` is not set (test on the mapping).
- [ ] `grep -rn "console\.\(log\|error\|warn\)" src/lib/server --include=*.ts | grep -v platform/logger.ts` returns nothing.
- [ ] `logger.test.ts` proves `email`, `name`, `password`, `token` fields are redacted.
- [ ] `request-limits.test.ts` proves max/deny/reset on PGlite.
- [ ] `emails.test.ts` covers all seven templates for escaping.
- [ ] No test file performs network I/O (`grep -rn "fetch(" src --include=*.test.ts` shows only fakes/stubs passed in).
- [ ] Gate green.
