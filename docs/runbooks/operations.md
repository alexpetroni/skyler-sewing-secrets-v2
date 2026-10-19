# Operations runbook

Who this is for: whoever is on call for skylersewingsecrets.com. Security settings and the
reasoning behind them are in `docs/SECURITY.md`; the Neon cutover is in
`docs/analysis/01-neon-cutover.md`.

## 1. Environment variables

Declared once in `src/env.ts`, documented in `.env.example` (`npm run check-env` and
`tests/env-example.test.ts` fail when the two drift). Set them in Vercel (Production and Preview);
developers use `vercel env pull`. Only `src/lib/server/runtime/env.ts` reads the private ones.

| Variable | Used by |
| --- | --- |
| `DATABASE_URL`, `DATABASE_DRIVER` | `db/index.ts`: Neon pooled connection string (`neon`), or `pglite://./.pglite` locally |
| `BETTER_AUTH_SECRET` | Better Auth session and token signing |
| `PUBLIC_SITE_URL` | canonical origin: auth base URL, Stripe return URLs, emails |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Checkout, refunds, `/api/webhooks/stripe` signature check |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CONTACT_EMAIL` | transactional email; contact form inbox |
| `BUNNY_VIDEO_LIBRARY_ID`, `BUNNY_VIDEO_API_KEY` | video library API, TUS upload tickets, `/api/webhooks/bunny` re-fetch |
| `BUNNY_EMBED_TOKEN_KEY` | signed player URLs; playback fails closed without it |
| `BUNNY_STREAM_CDN_HOST` | thumbnails and previews |
| `PUBLIC_BUNNY_CDN_URL`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY` | image pull zone and `/admin/api/upload` storage writes |
| `BUNNY_CDN_TOKEN_KEY` (optional) | signed download links; links are unsigned when empty |
| `CRON_SECRET` | bearer token Vercel sends to `/api/jobs/*` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional) | Google sign-in, off when absent |
| `SENTRY_DSN`, `PUBLIC_SENTRY_DSN` (optional) | Sentry for server and browser; each side is off when its DSN is empty |
| `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (optional) | contact form challenge |
| `REVALIDATE_BYPASS_TOKEN` (optional) | on-demand ISR revalidation |

`npm run build` needs none of them.

## 2. Cron entries

Defined in `vercel.json`; each request carries `Authorization: Bearer $CRON_SECRET`.

| Path | Schedule | Does |
| --- | --- | --- |
| `/api/jobs/expire-orders` | every 15 minutes | expires pending orders whose Checkout Session lapsed |
| `/api/jobs/sync-media` | hourly | re-fetches Bunny videos stuck in processing when the webhook never arrived |

Both have `maxDuration: 60`. Run one by hand with
`curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/jobs/sync-media`.
Health: `GET /api/health` answers `{ status: 'ok', db: 'ok', version }`, or 503
`{ status: 'degraded', db: 'error' }` when `select 1` fails or takes over 5 s. Point an uptime check
at it if you add one.

## 3. Reading logs

1. Every response has an `x-request-id` header; the error page prints the same value as
   "Reference". Ask the user for it (or read it from the browser's network tab).
2. Vercel → project → Logs: search the id. The app logs JSON lines (`requestId`, `errorId`, `level`,
   `msg`); personal data is redacted.
3. Sentry: unexpected errors are captured with the same id in the log line; search the
   issue's events by time and route, then match `requestId` from the Vercel line.

Source maps are not uploaded (the build needs no secrets). To add them later, set
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` in Vercel only and add
`sentrySvelteKit({ sourceMapsUploadOptions })` before `sveltekit()` in `vite.config.ts`.

## 4. Rotating keys

Change the value in Vercel, redeploy, then revoke the old one.

- **Stripe**: roll the secret key in the dashboard (grace period), then roll the webhook signing
  secret: create a second endpoint, switch `STRIPE_WEBHOOK_SECRET`, delete the old endpoint.
- **Bunny**: library API key, embed token key (rotating it invalidates open player URLs, which
  last minutes), storage password, pull zone token key.
- **Resend / Google / Turnstile**: issue a new key, update, delete the old one.
- **`CRON_SECRET`**: change it in Vercel; the next deploy gives crons the new value.
- **`BETTER_AUTH_SECRET`**: signs out every user; do it only after a suspected leak.

## 5. Dashboard settings the app assumes

- **Stripe**: webhook endpoint `https://<site>/api/webhooks/stripe` with events
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
  `charge.dispute.created`. Currency GBP; amounts under 30p are refused by Stripe.
- **Bunny Stream**: embed view token authentication on (key = `BUNNY_EMBED_TOKEN_KEY`); webhook to
  `https://<site>/api/webhooks/bunny`; allowed referrers set to the site. The pull zone for images
  has token authentication on if `BUNNY_CDN_TOKEN_KEY` is set. See `docs/SECURITY.md`.
- **Neon**: scale-to-zero off on the production compute; use the pooled connection string.
- **Vercel**: set `regions` in `vite.config.ts` to the region nearest the Neon project (left for a
  human; see the comment there).

## 6. Maintenance switch, backups and alerts

**Maintenance switch**: Admin → Settings → maintenance mode. Visitors see the maintenance page
(503 at `/`, redirect elsewhere, 503 on writes); active admins, `/admin`, `/auth`, and the Stripe and
Bunny webhooks stay up (`src/lib/server/http/maintenance.ts`). The flag is cached up to a minute
per function instance, and a database read failure fails open.

**Backups**: Neon point-in-time restore. Raise the history window to 7 days, take a manual branch
snapshot before any migration, and restore by creating a branch at a timestamp, checking it, then
pointing `DATABASE_URL` at it (or copying the data back). Schema changes are additive migrations.

**Alerts to set up**
- Sentry: an alert on new issues and on error-rate spikes, to the owner's email.
- Vercel: notifications for failed cron invocations and failed deployments.
- Stripe: webhook failure emails on (Developers → Webhooks → endpoint → email alerts).
- Optional: an uptime check on `/api/health`.
