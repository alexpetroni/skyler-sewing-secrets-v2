# PHASE-09 — Marketing module: blog, FAQ, testimonials, contact, newsletter (double opt-in), settings

## Why

The public site's non-course content and the two unauthenticated write endpoints (newsletter,
contact) that the audit flagged as abuse vectors (H5). Services here are used by the public pages
(PHASE-10) and the admin (PHASE-19). Newsletter becomes confirm-first; contact and newsletter are
rate-limited and honeypot-protected; Turnstile is verified when configured.

## Read first

`legacy/src/routes/api/newsletter/+server.ts`, `legacy/src/routes/newsletter/unsubscribe/+page.server.ts`,
`legacy/src/lib/server/newsletter.ts` (+ tests), `legacy/src/routes/contact/+page.server.ts`,
`legacy/src/routes/leave-review/+page.server.ts`, `legacy/src/routes/blog/**`, `legacy/src/routes/faq/**`,
`legacy/src/routes/testimonials/**`, `legacy/src/lib/server/maintenance.ts`,
`src/lib/server/platform/request-limits.ts`, `src/lib/server/modules/marketing/emails.ts` (PHASE-06).

## Deliverables

### 1. `src/lib/server/modules/marketing/`

`createMarketingService({ db, mailer, limiter, log, siteUrl, secret, verifyTurnstile?, now? })`
with namespaces:
- `blog`: `listPublished()`, `getPublishedBySlug`, admin `listAll`, `getById`, `create`,
  `update` (Markdown → `content_html` via `renderMarkdown`; legacy rows already hold HTML in
  `content` — read `content_html ?? content` for display, and a `blog_posts.content_md` +
  `content_html` pair is added by a new migration `0003_marketing_markdown.sql` in this phase,
  additive), `publish/unpublish` setting `published_at` once, `remove`.
- `faq`: `listPublished()` grouped by category, admin CRUD, answer Markdown → `answer_html`
  (same migration adds `faq_items.answer_md`, `answer_html`).
- `testimonials`: `featured(limit)`, `listPublished()`, `submit({ userId, content, rating,
  authorTitle })` (unpublished; refuses editing a published one), admin `listAll`, `update`,
  `setPublished`, `remove`.
- `contact`: `submit(input)` → row + `contactNotificationEmail` to `contactEmail`; admin
  `list`, `markRead`.
- `newsletter`: `requestSubscription(email)` → if confirmed active: no-op; else upsert row with
  `confirmed_at = null`, random 32-byte token (hash stored in `confirm_token_hash`), send
  `newsletterConfirmEmail(confirmUrl)`; `confirm(token)` → sets `confirmed_at`, `is_active`,
  clears the hash, sends `newsletterWelcomeEmail(unsubscribeUrl)`; `unsubscribeToken(email)`,
  `verifyUnsubscribeToken`, `unsubscribeUrl` (HMAC port of legacy, constant-time compare);
  `unsubscribe(email, token)`; admin `list`, `exportCsv()` with every cell quoted and leading
  `= + - @` prefixed with `'` (audit L3).
- `settings`: `get(key)`, `set(key, value, actorId)` (audit log), `isMaintenanceMode()` with
  the 30-second cache used by the hook (move the cache here from PHASE-05 if it lives in
  `http/`).

### 2. Public endpoints and actions

- `POST /api/newsletter` (`src/routes/api/newsletter/+server.ts`): limiter `newsletter:<ip>`
  10 per hour → 429 with `Retry-After`; honeypot field `website` non-empty → `200 {ok:true}`
  without side effects; Turnstile token verified when `TURNSTILE_SECRET_KEY` is set; valid
  email → `requestSubscription`; always `200 {ok:true, message}` on success.
- `GET /newsletter/confirm?token=` page: calls `confirm`, shows success or “link invalid”.
- `/newsletter/unsubscribe` (GET verify only, POST unsubscribe) ported.
- `/contact` action: same limiter (5 per hour), honeypot, Turnstile, validation lengths as
  legacy, `contact.submit`.
- `/leave-review` action: `requireActiveMember`, validation as legacy, `testimonials.submit`.
  (Pages for contact, review, confirm, unsubscribe are built here as plain forms using the UI
  kit; PHASE-10 ports the surrounding marketing layout.)

### 3. Turnstile adapter

`src/lib/server/platform/turnstile.ts`: `createTurnstileVerifier({ secret, fetch })` →
`verify(token, ip): Promise<boolean>`; `fakes/turnstile.ts` with a scripted result. Container
builds it only when the secret is set; services treat `undefined` as “not configured”.

### 4. Tests

`marketing/newsletter.test.ts` (request → unconfirmed row + confirm mail; confirm → active +
welcome mail with a valid unsubscribe URL; second request on a confirmed address sends nothing;
invalid token rejected; legacy HMAC token tests ported; CSV export quoting incl. the `=` case);
`marketing/content.test.ts` (blog publish sets `published_at` once; Markdown rendered and
sanitised for blog and FAQ; testimonial submit then edit-after-publish refused; contact submit
sends to `contactEmail` with `replyTo`); `tests/routes/newsletter-endpoint.test.ts` (429 after
the limit, honeypot 200 with no row, invalid email 400, Turnstile failure 400 when configured);
`tests/routes/contact.test.ts` (limiter and honeypot).

Out of scope: page layouts (PHASE-10), admin screens (PHASE-19).

## Steps

1. Migration `0003_marketing_markdown.sql` (additive: four nullable text columns), commit.
2. Service namespaces + tests, two or three commits.
3. Turnstile adapter, endpoints, pages, tests, commit.
4. Wiring (`Services.marketing`), gate once.

## Definition of Done

- [ ] `drizzle/0003_marketing_markdown.sql` adds only nullable columns (grep for `DROP|SET NOT NULL` empty); `drizzle-kit generate` afterwards is a no-op.
- [ ] A newsletter row is never `is_active = true` without `confirmed_at` (service test); the welcome email is sent only on confirm (fake mailer asserts counts).
- [ ] `/api/newsletter` returns 429 with `Retry-After` after 10 requests from one key within an hour (test uses the limiter on PGlite with an injected clock).
- [ ] Honeypot submissions create no row and send no mail (newsletter and contact tests).
- [ ] CSV export quotes every cell and neutralises leading `=`, `+`, `-`, `@` (test).
- [ ] No endpoint or service logs an email address (reviewer greps `log.` calls in the module for `email` fields).
- [ ] Gate green.
