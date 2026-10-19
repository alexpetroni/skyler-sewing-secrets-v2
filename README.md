# Skyler's Sewing Secrets v2

The rebuild of [skylersewingsecrets.com](https://skylersewingsecrets.com) as a catalogue: the
flagship sewing course (lifetime, all-access), admin-defined bundles of videos and standalone
videos, bought through a cart and Stripe Checkout with per-product discount codes. Members of the
previous site keep their logins and everything they own. Videos are hosted on Bunny Stream, email
goes through Resend, and the app deploys to Vercel on SvelteKit 3.

The previous site is vendored read-only under `legacy/` for reference. The analysis behind the
rebuild is in [`docs/analysis/README.md`](docs/analysis/README.md).

## Architecture in brief

SvelteKit 3 (Svelte 5 runes, Tailwind 4) on Vercel's Node 24 runtime; Drizzle over Neon in
deployment and PGlite locally and in tests; Better Auth for accounts (bcrypt, Google, TOTP for
admins); Stripe Checkout and webhooks; Bunny Stream with signed embeds and TUS uploads.

- `src/lib/server/modules/` holds the domain: `auth`, `media`, `content`, `catalog`,
  `entitlements`, `commerce`, `marketing`, `admin`. Each is a factory with explicit dependencies,
  wired once in `src/lib/server/runtime/container.ts`.
- `src/lib/server/platform/` holds the adapters (Stripe, Bunny, Resend, logger, …) with
  in-memory fakes for tests.
- Routes are thin: parse with a shared valibot schema, check access, call one service.
- Access to a lesson is decided by entitlements: the flagship course grants every lesson, bundles
  and singles grant the lessons they list, refunds revoke.

The full description — request pipeline, data model, purchase and refund flows, access
resolution — is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local development

Requires Node 24 (see `.nvmrc`) and npm.

```sh
npm ci
cp .env.example .env   # fill in what you have; the comments say which values are optional
```

Without a Postgres server, point the app at an embedded PGlite database and seed it:

```sh
export DATABASE_DRIVER=pglite DATABASE_URL=pglite://./.pglite
npm run db:seed        # applies the migrations, then creates the dev data (safe to re-run)
npm run dev
```

`npm run db:seed` (`scripts/seed-dev.ts`) is idempotent. It creates, all with the password
`dev-password-123`:

- `admin@sewing.local`, an admin with two-factor off (the admin area asks you to turn it on);
- `member@sewing.local`, who owns the flagship course;
- the flagship course (one module, two lessons), two standalone videos sold as singles
  (`perfect-french-seams`, `invisible-zips`), the bundle `finishing-touches`, and the promo code
  `WELCOME10` (10% off).

The lessons point at fake Bunny videos, so the player stays empty while the signed URL is still
built. Stop `npm run dev` before seeding: PGlite allows one process per data directory. For a
Neon dev branch, run `npm run db:migrate` first and then `npm run db:seed` with that branch's
`DATABASE_URL`.

Other scripts: `npm run backfill` (legacy → v2 rows, see `docs/runbooks/backfill.md`),
`npm run check-env` (compares `.env.example` with `src/env.ts`), `npm run db:generate` (new
migration from the schema; migrations are additive).

## Verification

The four gate commands, run from the project root, must all pass before a change is merged:

```sh
npm run check   # svelte-check with --fail-on-warnings
npm run lint    # prettier --check . && eslint .
npm run build   # production build; also passes with no environment variables set
npm test        # vitest run: unit and PGlite-backed service and route tests, no network
```

CI (`.github/workflows/ci.yml`, job `gate`) runs the same four commands on every push and pull
request.

## End-to-end tests

The Playwright suite in `tests/e2e/` drives a deployed preview (Stripe test mode, a Neon branch):
buying a single video, a bundle with a code, locked lessons, a migrated member's course and
progress, refund revocation, and an admin composing a bundle.

```sh
cp tests/e2e/.env.example tests/e2e/.env   # point E2E_BASE_URL at the preview, fill the accounts
npx playwright install chromium
npx playwright test
npx playwright test --list                 # parses the suite without a browser
```

In CI the `e2e` job runs after the gate only when the repository variable `E2E_ENABLED` is `true`,
reading the `E2E_*` values from repository secrets. `refund-revokes.spec.ts` needs the Stripe CLI
and is skipped without `E2E_STRIPE_CLI=1`; `admin-bundle.spec.ts` is skipped without
`E2E_ADMIN_TOTP_SECRET`.

## Deployment

Vercel project with `@sveltejs/adapter-vercel` (`runtime: 'nodejs24.x'`), function region next to
the Neon database. Set the variables from `.env.example` for Production and Preview; the cron jobs
in `vercel.json` call `/api/jobs/*` with `CRON_SECRET`. Stripe and Bunny webhooks point at
`/api/webhooks/stripe` and `/api/webhooks/bunny`.

- [`docs/runbooks/operations.md`](docs/runbooks/operations.md): variables, crons, logs, key
  rotation, dashboard settings, maintenance switch, backups.
- [`docs/runbooks/backfill.md`](docs/runbooks/backfill.md): turning legacy rows into v2 rows,
  rehearsed on a Neon branch.
- [`docs/runbooks/launch.md`](docs/runbooks/launch.md): beta subdomain, domain move, rollback,
  post-launch checks.
- [`docs/runbooks/retire-legacy.sql`](docs/runbooks/retire-legacy.sql): dropping the legacy tables
  and columns after the retirement window (not applied).
- [`docs/SECURITY.md`](docs/SECURITY.md): headers, CSP, sanitiser, rate limits, secrets.
