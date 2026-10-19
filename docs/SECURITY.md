# Security

What the site enforces, where it is implemented, and what a human must switch on outside the
repository. Audit findings referenced as H/M/L are from `docs/analysis/02-security-audit.md`.

## Response headers

Set on every response, redirects and errors included, by
`src/lib/server/http/security-headers.ts` (a route may override a header deliberately):

| Header                      | Value                                                   |
| --------------------------- | ------------------------------------------------------- |
| `Content-Security-Policy`   | SvelteKit's nonce-based policy, see below               |
| `X-Content-Type-Options`    | `nosniff`                                               |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                       |
| `X-Frame-Options`           | `DENY` (kept beside `frame-ancestors` for old clients)  |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`              |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` over https only   |

## Content Security Policy (M2)

Configured in `vite.config.ts` (`csp.mode = 'nonce'`); SvelteKit adds the nonce to every script
it emits and `src/app.html` documents that any script added there must carry
`nonce="%sveltekit.nonce%"`. `tests/csp.test.ts` asserts the directives.

| Directive                   | Sources                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `default-src`               | `'self'`                                                                       |
| `script-src`                | `'self'`, `https://challenges.cloudflare.com` (Turnstile), plus the nonce      |
| `style-src`                 | `'self'`, `'unsafe-inline'`                                                    |
| `img-src`                   | `'self'`, `data:`, `blob:`, `https://*.b-cdn.net`, the `PUBLIC_BUNNY_CDN_URL` host, `https://*.googleusercontent.com` (Google account pictures) |
| `font-src`                  | `'self'` (fonts are self-hosted through fontsource)                            |
| `frame-src`                 | `https://iframe.mediadelivery.net` (Bunny player), `https://challenges.cloudflare.com` |
| `connect-src`               | `'self'`, `https://video.bunnycdn.com` (TUS uploads), `https://challenges.cloudflare.com` |
| `form-action`               | `'self'`, `https://accounts.google.com`, `https://checkout.stripe.com`         |
| `base-uri`                  | `'self'`                                                                       |
| `object-src`                | `'none'`                                                                       |
| `frame-ancestors`           | `'none'`                                                                       |
| `upgrade-insecure-requests` |                                                                                |

`'unsafe-inline'` for styles stays because Svelte transitions and the `reveal` action write
inline `style` attributes; Tailwind utilities are classes and need nothing. Scripts never get
`'unsafe-inline'`. The `PUBLIC_BUNNY_CDN_URL` host is added at build time only (Vite's
`loadEnv`); the wildcard already covers every Bunny pull zone, so the build needs no environment.
`form-action` names Google and Stripe because Chromium (unlike Firefox) applies the directive to
the redirects that follow a form submission: the Google button is a plain form that `/auth/oauth`
answers with a 303 to `accounts.google.com`, and the no-JavaScript checkout action answers with a
303 to Stripe Checkout. Without them Chrome refuses both navigations. PHASE-21 extends
`connect-src` with the Sentry ingest host.

## Rate limits (H5)

Better Auth's own limiter (`rate_limits` table, `rateLimit.storage = 'database'`) covers its HTTP
endpoints under `/api/auth/*`. Form actions that call `auth.api.*` directly bypass it, so they
count in `request_limits` through `createRequestLimiter` and answer **429**:

| Action                               | Key                                   | Limit        |
| ------------------------------------ | ------------------------------------- | ------------ |
| `/auth/sign-in`                      | `signin:<sha256(ip)>`                 | 10 / 60 s    |
| `/auth/sign-in`                      | `signin:<sha256(email)>`              | 20 / 15 min  |
| `/auth/forgot-password`              | `forgot-password:<sha256(ip)>`        | 5 / 15 min   |
| `/checkout` account step, claim code | `checkout-account:<sha256(ip)>`       | 5 / 15 min   |

Addresses and emails are hashed before they reach the table. Sessions per user are capped at
five: after each sign-in (password, two-factor completion, checkout, claim) the oldest beyond five
are deleted (`users.trimSessions`). Two-factor code attempts are limited by Better Auth (five per
challenge, then the account locks for a while); email claim codes allow five attempts and expire
after ten minutes.

## Admin two-factor authentication

- Every admin must have TOTP on. The hook sends an admin whose `users.twoFactorEnabled` is false
  to `/admin/security` (reads) or answers 403 (writes); only `/admin/security` and `/auth/*` stay
  reachable. `users.setAdmin` refuses actors without two-factor, so admin access can only be
  granted by an admin who has it.
- Enabling: password → QR code (otpauth URI, rendered server-side with `qrcode`) + secret +
  ten backup codes shown once → first code from the app confirms. Disabling needs the password
  and a current code. Better Auth keeps the secret and backup codes encrypted in `two_factors`.
- Sign-in for two-factor accounts stops at `/auth/two-factor` (Better Auth's two-factor cookie,
  ten minutes) and completes with a TOTP or a backup code; the redirect targets are the sign-in
  page's.

## Downloads and uploads (M7)

- Lesson resources on the storage pull zone are served through `/download/[id]`, which checks
  ownership and redirects to a URL signed for 300 seconds with `BUNNY_CDN_TOKEN_KEY`
  (`token = base64url(sha256(key + '/' + path + expires))`). Without the key the URL is plain and
  a warning is logged once per process. URLs outside the zone are redirected as stored.
- `POST /admin/api/upload` (admins only) accepts one multipart `file` of `image/jpeg`,
  `image/png`, `image/webp`, `image/avif` or `application/pdf`, at most 25 MB, and stores it
  under `uploads/<yyyy>/<mm>/<uuid>.<ext>` with an `audit_log` row. The extension comes from the
  content type, never from the file name. Vercel's serverless request body limit (4.5 MB) is
  below the 25 MB ceiling: larger files need the Bunny dashboard until uploads move to a
  presigned path.

## Data retention and GDPR

- **Export**: `/profile/export` returns the member's profile, orders with items, entitlements and
  lesson progress as JSON.
- **Deletion**: `/profile/delete` (password, or the typed phrase for Google-only accounts) and
  the admin's "Anonymise & delete" run `users.anonymise`: `users.email` becomes
  `deleted-<id>@invalid.local`, name blank, image null, two-factor off; `accounts`, `sessions`,
  `verifications` (by user id and by `*-otp-<email>` identifier) and `two_factors` rows deleted;
  the profile's email, name and avatar blanked and the account suspended with reason `deleted`;
  every entitlement revoked (`account deleted`); the newsletter row for the address removed.
  `orders` and `order_items` are kept for accounting; the audit row records the actor (self or
  admin) and no personal data. Admin accounts must lose admin first.
- **Logs** carry ids and statuses only; `email`, `name`, `password` and `token` fields are
  redacted by the logger. Limiter keys are hashes.
- **Account claim** (`/checkout`): an account that was pre-registered at checkout but never
  verified and never ordered can be claimed by proving control of the email with a six-digit
  code. The claim deletes the unproven password (Better Auth `revokeUnprovenAccountAccess`),
  marks the email verified and signs the claimant in; verified or ordering accounts are asked to
  sign in instead (H3).

## Dependencies

`npm audit --omit=dev --audit-level=high` exits 0 (2026-10-18). The remaining advisories are
four **moderate** findings in `esbuild` reached only through `drizzle-kit`
(`@esbuild-kit/core-utils`), a development tool that never runs in production; they are accepted
until `drizzle-kit` drops the dependency. `qrcode` is the only runtime dependency added by
PHASE-20.

## Settings a human must enable

Nothing in the repository can switch these on; verify them before real buyers arrive.

- **Bunny Stream** (video library): *Embed view token authentication* on, with the key in
  `BUNNY_EMBED_TOKEN_KEY` (playback fails closed without it); *Allowed referrers* set to the
  site's hosts; *MP4 fallback* off; *Direct play* off.
- **Bunny pull zone** (images and resources, `PUBLIC_BUNNY_CDN_URL`): *Token authentication* on
  with the key in `BUNNY_CDN_TOKEN_KEY`, otherwise download links are unsigned; *Referrer
  allow-list* with the site's hosts; hotlink protection on.
- **Bunny Storage**: the zone password in `BUNNY_STORAGE_API_KEY` is write-capable; keep it
  server-side only (it is never sent to the browser).
- **Stripe**: webhook endpoint secret in `STRIPE_WEBHOOK_SECRET`; events listed in
  `docs/analysis/03-architecture.md`.
- **Admins**: after deployment every existing admin signs in and completes `/admin/security`;
  until then they can reach nothing else in the panel.
- **Secrets hygiene (L6)**: `.env*` files other than `.env.example` are ignored by git; rotate any
  key that was ever committed to the legacy repository.
