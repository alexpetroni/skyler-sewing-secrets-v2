# 01 — Supabase → Neon on Vercel: state and cutover runbook

Decision (2026-10-18): production is still on Supabase and the Neon database does not exist yet.
The existing, already-hardened `vercel-neon-migration` branch is cut over **first**; v2 is then
built against the same Neon database with additive schema changes. Users move once.

## Where things stand

| Item | State |
|---|---|
| Production code | `vercel` branch (Supabase JS + Supabase Auth), last commit 2026-06-30, deployed on Vercel with `adapter-vercel` |
| Migration code | `vercel-neon-migration`: 81 commits on top of `vercel` (so nothing in production is missing from it), last commit 2026-09-06 |
| What those 81 commits contain | Neon + Drizzle + Better Auth foundation; every route converted; seed scripts ported; `scripts/migrate-to-neon`; **a full visual redesign** (`c199875 Redesign the site: editorial-luxury design system`); 15 hardening phases; Vitest + CI |
| Neon | not created |
| Vercel project | exists (`vercel.json`, `.vercel/output`); not linked in this working copy (`.vercel/project.json` missing); env vars still Supabase-era |
| Local `.env` | stale Supabase configuration; `.env.example` on the branch documents the Neon/Better Auth variables |
| Data migration script | `scripts/migrate-to-neon/index.ts`: `users` (preserves UUIDs and bcrypt hashes, links Google identities), `data` (14 public tables in FK order), `verify` (row counts); idempotent via `ON CONFLICT DO NOTHING` |
| Schema on Neon | `drizzle/0000_init.sql` + `0001_triggers_functions_seed.sql` (triggers, `increment_promo_code_usage`, default `pricing_config` and `site_settings` rows) |

Two consequences worth saying out loud:

1. **The cutover ships the redesign.** It cannot be separated cheaply (one large commit before the
   hardening phases). The owner must approve the new look on a preview URL before the switch.
2. **Every user is signed out once.** Supabase session cookies mean nothing to Better Auth.
   Passwords are unchanged (bcrypt hashes are copied), Google sign-in keeps working through account
   linking by verified email. Communicate it in advance.

## How the auth migration preserves logins

- `auth.users.id` → `users.id` (same UUID), so `profiles`, `user_progress`, `payments`,
  `testimonials` keep their foreign keys untouched.
- `auth.users.encrypted_password` (bcrypt `$2a$`/`$2b$`) → `accounts.password` on a `credential`
  account; Better Auth is configured with bcryptjs `hash`/`verify`, so existing passwords work.
  Non-bcrypt hashes are skipped with a warning and those users need one reset email.
- `auth.identities` with `provider = 'google'` → `accounts` rows with `providerId 'google'` and
  `accountId = Google sub`. Users whose identity row is missing still get in: Better Auth account
  linking with `trustedProviders: ['google']` attaches a Google login to the existing user with the
  same verified email.
- Emails are lower-cased on import; duplicate addresses differing only by case are reported before
  import (only the oldest is kept).
- `pricing_config` and `site_settings` are replaced, not merged, so production values win over the
  defaults inserted by the Drizzle migration. Side effect used below: if maintenance mode is on in
  Supabase at copy time, the new site starts in maintenance mode.

## Pre-flight (D-7 to D-1)

1. **Apply the pre-cutover security fixes** listed at the end of `02-security-audit.md` (patch
   `svelte`, `revokeSessionsOnPasswordReset`, remove admin-by-purchase, required embed signing, no
   emails in logs; WAF rate-limit rules in the Vercel dashboard). Each is a small commit on the
   branch and none adds a migration; CI must stay green.
2. **Create Neon through the Vercel Marketplace** (Vercel project → Storage → Neon). Pick the
   region that matches the Vercel function region; for a UK business set the Vercel function region
   to London (`lhr1`) and Neon to `aws-eu-west-2`. The integration injects `DATABASE_URL` (pooled)
   and `DATABASE_URL_UNPOOLED` into the project for all environments. Disable scale-to-zero on the
   production compute if the plan allows it (removes 0.5–1 s cold starts on the first request after
   idle).
3. **Set the remaining environment variables** on Vercel for Production and Preview:
   `BETTER_AUTH_SECRET` (new, `openssl rand -base64 32`), `GOOGLE_CLIENT_ID/SECRET` (same client;
   add `https://<domain>/api/auth/callback/google` as an authorised redirect URI now, keep the
   Supabase callback until after the switch), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PUBLIC_SITE_URL`, `PUBLIC_BUNNY_STORAGE_ZONE`,
   `PUBLIC_BUNNY_CDN_URL`, `BUNNY_API_KEY`, `BUNNY_VIDEO_LIBRARY_ID`, `BUNNY_VIDEO_API_KEY`,
   `BUNNY_EMBED_TOKEN_KEY`, `CONTACT_EMAIL`. Preview gets Stripe **test** keys and a test-mode
   webhook endpoint. Leave the Supabase variables in place until the switch.
4. **Stripe webhook**: the path is unchanged (`/api/stripe/webhook`) and the domain is unchanged,
   so the existing live endpoint and its signing secret keep working. Nothing to recreate.
5. **Apply the schema**: `DATABASE_URL=<unpooled> npx drizzle-kit migrate` (the two legacy
   migrations; the pre-cutover fixes add none).
6. **Rehearse the data copy** against the empty Neon database:
   `SUPABASE_DB_URL=<direct> NEON_DB_URL=<unpooled> npm run migrate:neon`. Supabase direct
   connections are IPv6-only on some plans; if the machine has no IPv6, use the Supabase *session
   mode* pooler string (port 5432) instead. Read every `!` warning. Expect all `✓` in `verify`.
7. **Deploy the branch as a Preview** (push triggers it) and test with real copied accounts:
   email/password sign-in, Google sign-in, admin sign-in and panel, a lesson video (signed embed
   plays, copying the iframe URL into a private window fails), password reset email, newsletter
   unsubscribe link, Stripe test checkout end to end (webhook + success page), maintenance toggle.
   Have the owner review the redesign on this URL.
8. **Reset Neon** for the real run (Neon branch reset, or `TRUNCATE` every table and re-run
   `drizzle-kit migrate`). The script is idempotent, but a fresh copy avoids stale rows from the
   rehearsal.
9. **Announce** to members: date, ~1 hour window, “you will need to sign in again with your usual
   password or Google”.

## Cutover day (window ≈ 1 hour, pick a low-traffic hour)

| Step | Action | Check |
|---|---|---|
| 1 | In the old admin, turn **maintenance mode on**. Note the time `T_freeze`. | Homepage returns 503 |
| 2 | `npm run migrate:neon -- users`, then `data`, then `verify` | all rows `✓`; warnings reviewed |
| 3 | Promote the admin on Neon: `UPDATE profiles SET is_admin = true WHERE email = '<admin>'` (the row is copied with its flag; this is a check, not a change, unless the admin-by-purchase path was the only thing that ever set it) | `SELECT email FROM profiles WHERE is_admin` |
| 4 | Fast-forward `main`: `git checkout main && git merge --ff-only vercel-neon-migration && git push` (`main` is a direct ancestor, so this is a fast-forward and the Vercel production branch setting does not change) | Vercel production deployment starts |
| 5 | Remove `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` from Vercel Production; confirm the Neon/Better Auth variables are present for Production; redeploy if the env changed after the build started | Deployment ready |
| 6 | Smoke test production: home (expect the maintenance page: the flag came over as `true`), sign in as admin, `/admin` loads, open a lesson (video plays), sign in as a member in a private window, Google sign-in, send a password reset to yourself, Stripe → *Send test webhook* to the live endpoint returns 200 | all green |
| 7 | **Delta copy**: run `npm run migrate:neon` once more. `ON CONFLICT DO NOTHING` inserts only rows created after the rehearsal/first pass. Then reconcile updates that `DO NOTHING` cannot carry: `SELECT user_id, stripe_checkout_session_id FROM payments WHERE created_at > T_freeze` on Supabase; for each, ensure `profiles.is_member = true` on Neon | counts match again |
| 8 | Turn **maintenance mode off** in the new admin | Homepage 200 with the redesign |
| 9 | Watch Vercel logs for `[webhook]`, `[error]`, `[auth]` lines for the next hours | no 5xx spikes |

A live payment during the window is handled by Stripe's retry policy: the webhook keeps failing
against the frozen old site and succeeds against the new one; the success page on the old site may
have written to Supabase, which step 7 reconciles.

## Rollback

Until Supabase is paused, rollback is a Git and env change: `git revert`/reset `main` to the
`vercel` commit (or set the Vercel production branch to `vercel`), restore the three Supabase
variables, redeploy, turn maintenance off on the old site. Payments made against Neon in the
meantime must be copied back by hand (unlikely in a one-hour window). Keep Supabase untouched for
30 days; pause it after 7 days of clean operation; delete after 30.

## Post-cutover (D+1 to D+30)

- Rotate keys that lived in local `.env` files (Resend, Bunny, Google secret; Stripe restricted key
  if used) and keep them only in Vercel; developers use `vercel env pull`.
- Clear leftover Supabase cookies (`sb-<project-ref>-auth-token*`) in the hook for 60 days to avoid
  oversized cookie headers for returning users.
- Send reset emails to any users the import flagged with non-bcrypt hashes.
- Remove the Supabase redirect URI from the Google OAuth client; remove Supabase from the Resend
  allowed senders if it was there.
- Check Resend domain verification (SPF/DKIM) — a decision log entry from 2026-01-28 says the contact
  form was hidden pending verification; confirm it is done.
- Enable Neon point-in-time restore (default 1 day on paid plans; raise to 7) and take a manual
  branch snapshot the first week.
- After 30 days: delete the Supabase project, move `supabase/` and `scripts/migrate-to-neon` to
  `scripts/legacy/` or delete them, update `ARCHITECTURE.md` (it still describes Supabase and the
  Docker/Bunny-container deployment that no longer exists).

## Known risks

| Risk | Mitigation |
|---|---|
| Supabase direct connection unreachable (IPv6) | session-mode pooler string, or run the script from a host with IPv6 |
| Case-colliding emails | the script lists them before import; merge or rename in Supabase first |
| Admin account lost | step 3 check; `seed/create-user.ts` as a fallback |
| Owner dislikes the redesign | preview approval in pre-flight step 7; the alternative (reverting `c199875` against 15 later phases) costs days |
| Neon cold starts | disable scale-to-zero on production compute |
| Vercel and Neon in different regions | hooks do 2–3 queries per request; cross-region adds 60–100 ms each; align regions |
| `neon-http` has no transactions | the branch already uses `db.batch`; v2 switches to the WebSocket driver (see `03-architecture.md`) |
| Emails land in spam after the switch | same Resend domain, no change; verify DKIM anyway |

## What v2 inherits from this step

The Neon project with real users in Better Auth tables, the Vercel project and its environment,
the Stripe webhook endpoint, signed Bunny embeds, and a production site that is already hardened.
v2 adds tables and columns additively while this branch keeps serving traffic, then takes over by
moving the domain (see `03-architecture.md`, “Taking over production”).
