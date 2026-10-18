# PHASE-20 — Security hardening: CSP, admin 2FA, rate limits on auth actions, signed downloads and uploads, GDPR, account claim

## Why

Closes the audit items deferred to v2 (`02-security-audit.md` M1 follow-through, M2, M7, H3
second half, H5 for the custom actions, L6 hygiene) and the compliance items from
`06-new-approaches.md`. Everything here is behaviour that must exist before real buyers use the
beta.

## Read first

`docs/analysis/02-security-audit.md` (all), `docs/analysis/06-new-approaches.md` → Content
protection, Compliance; `src/lib/server/http/create-handle.ts`, `src/lib/server/modules/auth/*`,
`src/routes/(auth)/*`, `src/routes/(shop)/checkout/*`, `vite.config.ts`; Better Auth docs for
`twoFactor` and `emailOTP` via the Svelte MCP or `node_modules/better-auth/dist/plugins/**`.

## Deliverables

### 1. Content Security Policy

`vite.config.ts` `csp: { mode: 'nonce', directives: {...} }`: `default-src 'self'`;
`script-src 'self' https://challenges.cloudflare.com`; `style-src 'self' 'unsafe-inline'`
(Tailwind utilities are classes; inline styles from Svelte transitions need it — document);
`img-src 'self' data: blob: https://*.b-cdn.net` plus the host of `PUBLIC_BUNNY_CDN_URL`;
`font-src 'self'`; `frame-src https://iframe.mediadelivery.net https://challenges.cloudflare.com`;
`connect-src 'self' https://video.bunnycdn.com https://challenges.cloudflare.com` (TUS
uploads, Turnstile) plus the Sentry ingest host when configured (PHASE-21 extends);
`form-action 'self'`; `base-uri 'self'`; `object-src 'none'`; `frame-ancestors 'none'`;
`upgrade-insecure-requests`. `src/app.html` scripts carry `%sveltekit.nonce%`. Remove the
`X-Frame-Options` header only if `frame-ancestors` is set (keep both otherwise).

### 2. Admin two-factor authentication

- `/admin/security`: enable 2FA (password confirmation → `twoFactor.enable` → show `totpURI`
  as a QR (`qrcode` runtime dependency, named here, rendering to a data URL) and the secret;
  verify with the first code → enabled; backup codes shown once; disable with password + code.
- Hook admin gate: an admin whose `users.twoFactorEnabled` is false may reach only
  `/admin/security` and `/auth/*`; everything else under `/admin` redirects there with a flash.
- Sign-in: when Better Auth answers with the two-factor redirect, `/auth/two-factor` asks for
  TOTP or a backup code and completes the session; the existing redirect targets are kept.
- `users.setAdmin` requires the actor to have 2FA enabled.

### 3. Rate limits on the custom auth actions

`auth.api.*` calls from form actions bypass Better Auth's HTTP rate limiter, so the sign-in
action (`signin:<ip>` 10 / 60 s and `signin:<email-hash>` 20 / 15 min), forgot-password (5 /
15 min per ip) and the checkout account step (5 / 15 min per ip) consume the PHASE-06
limiter and return `fail(429, …)` with a friendly message. Sessions per user capped at five:
after each sign-in the oldest beyond five are deleted (`auth.trimSessions(userId, 5)`).

### 4. Signed downloads and admin uploads (Bunny Storage)

`src/lib/server/platform/bunny-storage.ts`: `BunnyStorage { put(path, bytes, contentType),
delete(path), signedUrl(path, ttlSeconds) }` with Bunny CDN token authentication
(`token = base64url(sha256(key + path + expires))`, `?token=&expires=`), plus a fake. Config
`BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `PUBLIC_BUNNY_CDN_URL`, new
`BUNNY_CDN_TOKEN_KEY` (declare in `src/env.ts`, optional: when absent, `signedUrl` returns the
plain URL and logs a warning once). `/download/[id]` redirects to `signedUrl(path, 300)`.
`POST /admin/api/upload` (admin, multipart, ≤ 25 MB, content types `image/jpeg|png|webp|avif`,
`application/pdf`) → storage path `uploads/<yyyy>/<mm>/<uuid>.<ext>` → returns the CDN URL;
admin editors (lesson resources, product cover, blog image, testimonial avatar) get an “Upload”
button writing the URL into the existing field.

### 5. GDPR: delete and export

`/profile/export` → JSON download (profile, orders with items, entitlements, progress);
`/profile/delete` → password (or Google re-auth not available: require the typed phrase)
→ `auth.anonymise(userId)`: `users.email = deleted-<id>@invalid.local`, name blank,
`image` null, `accounts`/`sessions`/`verifications` rows deleted, profile personal fields
blanked, `is_suspended = true` with reason `deleted`, entitlements revoked, orders and
`order_items` kept, `newsletter_subscribers` row for the address removed, audit row with
`actor = self`. Admin `users/[id]` gets “Anonymise & delete” (ConfirmForm).

### 6. Account claim at checkout

When the checkout email belongs to an account that is **unverified and has no orders**,
offer “Send me a code”: Better Auth `emailOTP` plugin (`sendVerificationOTP` through the
mailer) signs the claimant in on a correct code (`sign-in` type) and marks the email verified;
the checkout then continues with that account and the buyer is asked to set a password from
`/profile` afterwards (flash). Verified or ordering accounts keep the “please sign in” answer.

### 7. Hygiene

`npm audit --omit=dev` shows no high or critical advisory (upgrade or document an exception in
`docs/SECURITY.md`); `docs/SECURITY.md` lists the headers, CSP, limits, 2FA policy, data
retention, and the Bunny settings a human must enable (token auth, referrers, MP4 fallback off,
CDN token key).

### 8. Tests

Hook tests: CSP header present with a nonce on a page response (use the built handle with a
minimal route or assert `vite.config.ts` directives in a config test — do both: a config test
reading the file, and a `create-handle` test that the pipeline does not strip SvelteKit's CSP
header); admin without 2FA → redirect to `/admin/security`; with 2FA → pass. Auth action tests:
11th sign-in attempt → 429; session trimming keeps five. Storage: `signedUrl` formula test;
upload endpoint rejects non-admin, oversize, wrong type; accepts a PNG to the fake storage.
Anonymise: fields blanked, orders kept, entitlements revoked, sign-in impossible. Claim: OTP
email sent via fake mailer, correct code signs in and verifies; wrong code refused; verified
account not offered the claim.

Out of scope: Sentry (PHASE-21), Playwright (PHASE-22).

## Steps

1. CSP + config test, commit.
2. 2FA pages + gate + sign-in flow + tests (`qrcode` added), commit.
3. Auth action limits + session cap + tests, commit.
4. Bunny Storage adapter + downloads + upload endpoint + editor buttons + tests, commit.
5. GDPR export/delete + tests, commit.
6. OTP claim + tests, commit.
7. `npm audit`, `docs/SECURITY.md`, gate once.

## Definition of Done

- [ ] `vite.config.ts` has `csp.mode = 'nonce'` with every directive listed (config test asserts them); `app.html` scripts use `%sveltekit.nonce%`.
- [ ] An admin without 2FA cannot load `/admin` (redirect test) and cannot promote others (`setAdmin` refuses; test).
- [ ] Sign-in action returns 429 after the limit (test) and sessions are capped at five (test).
- [ ] `/download/[id]` returns a signed URL when the CDN token key is configured (test with fake storage); the upload endpoint enforces admin, size and type (tests).
- [ ] `anonymise` blanks personal data, keeps orders, revokes access and prevents sign-in (test).
- [ ] The OTP claim path is offered only to unverified, order-less accounts and verifies the email on success (tests).
- [ ] `npm audit --omit=dev --audit-level=high` exits 0 or `docs/SECURITY.md` documents each remaining advisory; `qrcode` is the only new runtime dependency.
- [ ] Gate green.
