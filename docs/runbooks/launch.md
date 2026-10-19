# Launch runbook — v2 takes over skylersewingsecrets.com

The takeover described in `docs/analysis/03-architecture.md` → “Taking over production”: v2 runs
in its own Vercel project against the **same** Neon database as the legacy app, first on a beta
subdomain, then the production domain moves from the legacy project to v2. Rollback is moving the
domain back. The legacy tables are retired two weeks later.

Names used below: `<domain>` = `skylersewingsecrets.com`, `beta.<domain>` = the beta subdomain,
legacy project = the current Vercel project serving `<domain>`, v2 project =
`skyler-sewing-secrets-v2`. Environment variables are described in `docs/runbooks/operations.md`.

## 1. Beta (weeks before launch)

1. Create the v2 Vercel project from this repository (framework SvelteKit, Node 24, function
   region = the Neon region). Connect the existing Neon project through the Vercel Marketplace
   integration, or copy `DATABASE_URL` from the legacy project.
2. Set every variable from `.env.example` for Production and Preview (`npm run check-env` lists
   them). During the beta `PUBLIC_SITE_URL=https://beta.<domain>`. Use the live Stripe keys only
   for Production; Preview uses test mode and a Neon branch.
3. Add the domain `beta.<domain>` to the v2 project (CNAME `cname.vercel-dns.com`).
4. Run the migrations and the backfill on production as `docs/runbooks/backfill.md` says
   (rehearsal first). The legacy app keeps working: everything is additive.
5. **Stripe**: Dashboard → Developers → Webhooks → *Add endpoint*
   `https://beta.<domain>/api/webhooks/stripe` with the events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.dispute.created`. Put its signing secret in the v2 project's `STRIPE_WEBHOOK_SECRET`.
   The legacy endpoint (`https://<domain>/api/stripe/webhook`) stays. Both endpoints now receive
   every event and both fulfil idempotently; v2 records sessions it did not create in
   `webhook_events` with an `error` (“no order”), which is expected during the overlap.
6. **Bunny Stream**: Library → Webhook URL `https://beta.<domain>/api/webhooks/bunny` (the
   handler re-fetches the video, so the payload is only a hint). Add `beta.<domain>` to the
   library's allowed referrers next to `<domain>`.
7. **Google OAuth** (Google Cloud console → Credentials → the web client): add the authorised
   JavaScript origin `https://beta.<domain>` and the redirect URI
   `https://beta.<domain>/api/auth/callback/google`. Keep the `<domain>` entries.
8. **Resend**: the sending domain is unchanged; nothing to do beyond confirming SPF/DKIM pass.
9. Seed the E2E accounts on a Preview branch and run the browser suite (section 5), then the owner
   acceptance pass on `beta.<domain>`: sign in as a migrated member, buy a single video in Stripe
   test mode on a preview, check the admin can upload a video and publish a bundle.

## 2. Launch day

Pick a low-traffic hour. Allow one hour.

1. Turn the legacy site's maintenance switch on (stops new legacy checkouts; Stripe webhooks keep
   flowing). Wait 30 minutes for open legacy Checkout sessions to finish.
2. Re-run the backfill on production (`--step all --dry-run`, then `--step all`): it picks up
   members and payments created since the last run. Run the verification SQL.
3. In the legacy project, note its `*.vercel.app` production URL, then edit the legacy Stripe
   endpoint URL to `https://<legacy-project>.vercel.app/api/stripe/webhook` so that late events for
   legacy sessions still reach the legacy app after the domain moves.
4. v2 project: set `PUBLIC_SITE_URL=https://<domain>` (Production) and redeploy.
5. Move the domain: legacy project → Settings → Domains → remove `<domain>` and `www.<domain>`;
   v2 project → add both (keep `www` redirecting to the apex as today). DNS does not change when
   both projects are on the same Vercel team; propagation is immediate.
6. Stripe: edit the v2 endpoint URL to `https://<domain>/api/webhooks/stripe` (the signing secret
   stays the same). Bunny: set the webhook URL to `https://<domain>/api/webhooks/bunny`.
7. Run the post-launch checks (section 4) within the hour.

## 3. Rollback

Until the retirement SQL runs, rolling back is a domain move:

1. v2 project → remove `<domain>` and `www.<domain>`; legacy project → add them back, maintenance
   off.
2. Stripe: set the legacy endpoint URL back to `https://<domain>/api/stripe/webhook`; leave the v2
   endpoint on `https://beta.<domain>/api/webhooks/stripe`. Bunny webhook back to the legacy URL.
3. Purchases made on v2 in the meantime are `orders` + `entitlements` rows the legacy app does not
   read; the members among them still have `profiles.is_member = true` (v2 keeps it in sync), so
   course buyers keep access. Buyers of bundles or single videos need v2 back: list them with
   `SELECT DISTINCT o.user_id FROM orders o WHERE o.status = 'paid' AND o.created_at > '<launch time>'`
   and tell them before rolling forward again.

## 4. Post-launch checks

Within the first hour:

- `curl -s https://<domain>/api/health` returns `200` with `"status":"ok"` and `"db":"ok"`.
- A migrated member signs in with their old password and with Google; the library lists the course
  and a lesson plays (the player `src` carries `token=`).
- Buy the cheapest single video with a real card, then refund the payment in the Stripe
  dashboard. Admin → Orders shows the order `paid`, then `refunded` once `charge.refunded` lands;
  the video disappears from the buyer's library; the receipt and the access-revoked emails arrive.
- Stripe → the v2 endpoint shows 2xx deliveries; `webhook_events` has no new rows with `error`
  other than legacy sessions.
- Bunny: upload a short test video from Admin → Media; it reaches `ready` within minutes (or on
  the hourly `sync-media` run).
- Vercel → Cron Jobs shows `expire-orders` and `sync-media` succeeding; Sentry shows no new issues.
- Old URLs (`/modules/...`, `/auth/sign-in`, marketing pages) still answer; `sitemap.xml` lists
  `https://<domain>` URLs.

Daily for the first week: Stripe webhook failures, Sentry, `orders` stuck in `pending` older than an
hour (should be zero after `expire-orders`), member support email.

## 5. Browser suite

The Playwright suite under `tests/e2e/` runs against a deployed preview, never locally against
production:

1. Run `scripts/seed-dev.ts` against the Preview Neon branch
   (`DATABASE_URL=… npm run db:migrate && SEED_DEV_CONFIRM=<branch host> npm run db:seed`). The
   seed refuses a remote database without `SEED_DEV_CONFIRM`, and any database that already
   holds real accounts; on a branch backfilled from production, use real accounts instead.
2. Turn TOTP on for the E2E admin (Admin → Security) and keep the `secret=` from the otpauth URI.
3. Fill `tests/e2e/.env` from `tests/e2e/.env.example` (or set the repository secrets and the
   repository variable `E2E_ENABLED=true` for the CI `e2e` job).
4. `npx playwright install chromium && npx playwright test`. `refund-revokes.spec.ts` needs the
   Stripe CLI on `PATH`, `STRIPE_API_KEY` set to the test-mode key and `E2E_STRIPE_CLI=1`.

## 6. Retirement window

Two weeks after launch, with no rollback in that time:

1. Delete the legacy Stripe endpoint and remove the legacy project's domains; pause the legacy
   Vercel project (delete it a month later).
2. Ship the code changes listed in `docs/runbooks/retire-legacy.sql`, then run that file on a
   rehearsal branch, then on production, after a snapshot branch `pre-retire-<date>`.
3. Remove `beta.<domain>` from Google OAuth, Bunny referrers and the v2 project once nothing links
   to it.
