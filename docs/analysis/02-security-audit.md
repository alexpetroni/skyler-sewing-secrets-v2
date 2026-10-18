# 02 — Security audit of the branch that will go live first

Scope: the `vercel-neon-migration` branch of `skyler-sewing-secrets` as of commit `136425c`
(2026-09-06), read file by file on 2026-10-18. This is the code that will serve production once
the Neon cutover happens (see `01-neon-cutover.md`), so every finding is tagged with *when* to fix
it: **before cutover** (small, contained change on the existing branch) or **in v2** (needs the new
data model or is not worth touching in code that will be replaced).

Verification run on the branch: `npm run check` → 0 errors, 2 known a11y warnings;
`npm test` → 77 tests pass in 10 files; `npm audit --omit=dev` → 14 advisories (7 high).

## What is already good

The 15 hardening phases did real work. Keep these properties in v2:

- Server-side authorization is explicit everywhere (`isActiveMember` / `isActiveAdmin` in
  `src/lib/server/access.ts`), and the `/admin` gate runs in `hooks.server.ts` so form actions
  are covered, not only layouts.
- Payment ownership: `recordPaidCheckout` in `src/lib/server/membership.ts` claims the Stripe
  session with a unique insert first, grants membership only to the recorded owner, and counts
  promo usage once. The success page refuses to grant a session to a different signed-in account.
- Webhook signature verification, `payment_status === 'paid'` check, and 500-on-failure so Stripe
  retries.
- Redirect targets validated (`safeRelativeTarget`), UUID validation on every admin id, integer and
  date parsers that cannot produce `NaN`.
- Signed, constant-time-compared unsubscribe tokens; GET never mutates.
- Baseline security headers on every response, including redirect and error responses built in the
  hook.
- Passwords stay bcrypt so migrated users keep their credentials; no password is ever carried in a
  cookie.
- Public sign-up endpoint disabled (`disableSignUp: true`), password-reset does not leak account
  existence.
- Unit tests and CI exist.

## Findings

Severity is the realistic impact for this business (a small course site with payments), not a
generic CVSS score.

### HIGH

**H1. Framework packages with published XSS advisories.** `svelte@5.46.3` is below the patched
range for nine advisories (SSR attribute spreading, `<svelte:element>` tag validation, `<option>`
SSR, hydratable promise serialisation, DOM clobbering). The site spreads props onto elements in
`src/lib/components/ui/*.svelte` and renders server-side, so this is not theoretical. `vite`,
`qs`, `source-map-js` advisories are dev-time or low impact.
*Fix before cutover:* `npm audit fix`, confirm `svelte >= 5.57`, rerun check/build/test. Zero code
changes expected.

**H2. Paid video embeds are unsigned and shareable.** `BUNNY_EMBED_TOKEN_KEY` is optional; when
unset (`.env.example` ships it empty) `getBunnyEmbedUrl` in `src/lib/server/bunny.ts` returns a
stable `iframe.mediadelivery.net/embed/{lib}/{video}` URL. Anyone who copies it from the page source
can watch and share every lesson without an account.
*Fix before cutover:* in the Bunny Stream library enable *Embed view token authentication*, set the
key in Vercel, and in the library's security settings restrict *Allowed referrers* to the production
domain and disable MP4 fallback / direct play URLs. Make the env var required in code (fail closed:
throw at startup if missing in production).

**H3. Account pre-registration plus sessions that survive password reset.** The checkout action in
`src/routes/checkout/+page.server.ts` creates a credential account for *any* email with the
buyer-supplied password, marks it `emailVerified: true` (`createCredentialUser` in
`src/lib/server/users.ts`), and signs the browser in, all *before* payment. An abandoned checkout
leaves a verified, signed-in, non-member account for an email the visitor may not own. Better Auth's
`emailAndPassword.revokeSessionsOnPasswordReset` is not set and defaults to `false`
(`node_modules/better-auth/dist/api/routes/password.mjs:163`). Chain: attacker registers the victim's
address through checkout and keeps the session; victim later buys, is told the email exists, resets
the password, pays; the attacker's 7-day session is still valid and now has member access.
*Fix before cutover:* set `revokeSessionsOnPasswordReset: true` in `src/lib/server/auth.ts` (one
line, closes the chain). *Fix in v2:* do not mark the email verified until Stripe reports the paid
`customer_details.email` (or the user completes an OTP), and let checkout *claim* an unverified
account with no orders instead of rejecting the email.

**H4. Admin privilege granted by purchase.** `handleCheckoutComplete` in
`src/routes/api/stripe/webhook/+server.ts` sets `is_admin = true` when the paid email equals
`ADMIN_EMAIL`. If that account does not exist in Neon after migration (address changed, typo in the
env var, admin uses Google with a different address), the first person to check out with that
address (creating it with their own password) and pay £149 becomes an administrator.
*Fix before cutover:* delete the `grantAdmin` path and the `ADMIN_EMAIL` bootstrap; make admins via
`seed/create-user.ts` or a one-off SQL `UPDATE profiles SET is_admin = true`. Verify the migrated
admin row has `is_admin = true` before DNS/branch switch.

**H5. No effective rate limiting on a serverless deployment.** Better Auth rate limiting uses an
in-memory store by default, which is per function instance on Vercel and therefore ineffective for
`/api/auth/sign-in/email`, `/api/auth/request-password-reset` and the custom sign-in action. The
unauthenticated `POST /api/newsletter` sends a welcome email to any address on every call (an email
bomb and Resend-reputation risk) and `POST /contact` emails the owner. Nothing is CAPTCHA-protected.
*Fix before cutover (no schema change):* Vercel WAF rate-limit rules on `/api/newsletter`,
`/contact`, `/auth/*` and `/api/auth/*`. Do **not** switch Better Auth to
`rateLimit.storage: 'database'` on the legacy branch: it needs a new table and therefore a new
migration, and the v2 build starts from the migration history vendored from this branch; keeping
the cutover fixes schema-free keeps the two repositories independent. *Fix in v2:* the
database-backed limiter and its table (PHASE-04/05), Cloudflare Turnstile on the newsletter and
contact forms, newsletter double opt-in (confirmation link; the row is created only on
confirmation).

### MEDIUM

**M1. Unsanitised admin-authored HTML rendered with `{@html}`.** Blog content
(`src/routes/blog/[slug]/+page.svelte:85`), lesson content
(`src/routes/modules/[moduleSlug]/[lessonSlug]/+page.svelte:117`) and FAQ answers
(`src/routes/faq/+page.svelte:93`) are stored as raw HTML and rendered verbatim. One phished admin
password equals persistent XSS on every public page. *In v2:* store Markdown, render server-side
through a sanitiser at save time, and require 2FA for admin accounts (Better Auth `twoFactor`
plugin).

**M2. No Content-Security-Policy.** The hook comment acknowledges it. A nonce-based CSP via
SvelteKit's `csp` config with `frame-src https://iframe.mediadelivery.net`, `img-src` for the Bunny
CDN and self-hosted fonts (drop the Google Fonts request) removes a whole class of impact from M1.
*In v2.*

**M3. Refunds and disputes never revoke access.** The webhook handles only
`checkout.session.completed` and logs `payment_intent.payment_failed`. `payments.status` can never
become `refunded`; a refunded buyer keeps lifetime access. *In v2:* handle `charge.refunded`,
`charge.dispute.created`, `checkout.session.async_payment_failed`; revoke the order's entitlements.

**M4. Promo usage cap is advisory.** Validity (`current_uses < max_uses`) is checked when the
Checkout Session is created; the counter is incremented when the payment lands. Concurrent buyers
exceed `max_uses`, and `increment_promo_code_usage` has no upper bound. *In v2:* a `promo_redemptions`
row per order inserted inside the same transaction as the order, with the cap enforced by a
`SELECT ... FOR UPDATE` on the code or a conditional update.

**M5. Personal data in logs.** The webhook logs `customer_details.email` and the full metadata
object on every event; `sendEmail` in `src/lib/server/email.ts` logs every recipient address with
`console.error`; the newsletter endpoint logs the subscriber address. Vercel retains logs and
third-party log drains may copy them. *Before cutover* (trivial): log ids and statuses only, same
rule Phase 15 applied to the success page.

**M6. Financial records cascade-delete with the user.** `payments.user_id` references `profiles`
with `onDelete: 'cascade'`; deleting a profile erases its payment history. *In v2:* orders reference
users with `RESTRICT`, and user removal is a soft delete / anonymisation that keeps order rows for
accounting.

**M7. Lesson resources would be public once used.** `lesson_resources.file_url` is a plain URL;
the component renders it as a direct link. No resources exist in the seed data today, but the first
PDF uploaded to Bunny Storage is downloadable by anyone with the link. *In v2:* serve downloads
through a server route that checks the entitlement and redirects to a short-lived Bunny signed URL.

### LOW

**L1. Admin layout gate uses raw `is_admin`.** `src/routes/admin/+layout.server.ts` checks
`locals.profile?.is_admin` instead of `isActiveAdmin`. The hook already blocks suspended admins, so
this is defence in depth only.

**L2. `/api/progress` GET does not validate `lessonId` / `moduleId`.** A non-UUID value reaches
Postgres and surfaces as a 500. No data exposure, just noise.

**L3. CSV export without quoting.** `src/routes/admin/subscribers/+page.svelte` joins cells with
commas and no escaping. A subscriber address beginning with `+`, `-`, `=` or `@` becomes a formula
when the admin opens the file in Excel (CSV injection). Quote every cell and prefix dangerous
leading characters with `'`.

**L4. Checkout Session creation has no idempotency key.** A double submit creates two Stripe
sessions. Harmless but untidy; pass `{ idempotencyKey }` keyed on the order id in v2.

**L5. `payment_method_types: ['card']` is hard-coded.** Omit it so Stripe Checkout offers Apple
Pay, Google Pay and Link (configured in the Stripe dashboard). Conversion, not security, but it is a
one-line change.

**L6. Secrets hygiene.** The working copy holds `.env` and `.env.tmp` with live Supabase, Stripe,
Resend and Bunny keys plus an `ADMIN_PASS` and two stray `OAuth*` lines. Neither file is tracked
(`.gitignore` covers them), so this is not a leak, but at cutover rotate every key that is reused on
Neon/Vercel (Stripe webhook secret will be new anyway, Resend, Bunny API keys, Google client
secret) and switch local development to `vercel env pull`. `fix-env.js` is a no-op script that
rewrites a URL to itself; delete it.

**L7. Maintenance mode fails open when the database is down.** Documented and deliberate; just be
aware that a Neon outage shows the normal site with empty data rather than the maintenance page.

## Checks that passed (so nobody re-audits them)

- CSRF: SvelteKit's origin check covers form actions and `+server` form posts; `/api/progress`
  takes JSON (browser preflight applies); Better Auth has its own CSRF handling for `/api/auth/*`.
- Open redirects: `redirectTo` is validated in sign-in, OAuth callback router and member gates.
- SQL: all queries go through Drizzle parameters; the two `sql` template usages interpolate
  parameters, not strings.
- Session fixation: sessions are created by Better Auth after credential verification.
- Password reset tokens: single use, 1 hour, sent through Resend from the server.
- Membership flags cannot be changed by users: `profiles` is only written server-side; the
  `updateProfile` action sets `full_name` only.
- Progress writes are scoped to `profile.id` and to published lessons.

## Pre-cutover checklist (small diff on the existing branch, **no schema change**)

Rule: nothing on this list may add a table, a column or a Drizzle migration. The v2 build copies
this branch's `drizzle/` folder as its migration baseline; keeping the list schema-free means the
snapshot already vendored into v2 stays valid and the two repositories never have to be
re-synchronised.

1. `npm audit fix`; verify `svelte >= 5.57`, `vite >= 7.3.7`; run `npm run check && npm run build && npm test`.
2. `revokeSessionsOnPasswordReset: true` in `src/lib/server/auth.ts`.
3. Remove `grantAdmin` / `ADMIN_EMAIL` bootstrap from the webhook; promote the admin by SQL after the data copy.
4. Vercel WAF rate-limit rules on `/auth/*`, `/api/auth/*`, `/api/newsletter`, `/contact` (dashboard configuration, no code).
5. Make `BUNNY_EMBED_TOKEN_KEY` required; enable token auth and referrer allow-list in Bunny.
6. Strip emails from webhook, email and newsletter logs.
7. Rotate third-party keys; set them only in Vercel.

Everything else, including the database-backed rate limiter, moves to the v2 backlog in
`03-architecture.md` and `06-new-approaches.md`.
