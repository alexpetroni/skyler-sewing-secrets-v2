# PHASE-22 — End-to-end tests, final documentation, backfill and launch runbooks

## Why

The money flows need browser-level proof against a real preview deployment (Stripe test mode,
real Neon branch), and the humans who cut over and launch need exact instructions. The sandbox
cannot run browsers, so this phase writes the suite and the CI job and proves the suite parses;
running it is the human's step listed in `docs/phase-runner/README.md`.

## Read first

`docs/analysis/01-neon-cutover.md`, `docs/analysis/03-architecture.md` → “Taking over production”,
`docs/analysis/README.md` → “Recommended sequence”; `scripts/backfill/run.ts`;
`src/lib/server/db/schema/**` (for the retirement migration); `README.md`, `CLAUDE.md`.

## Deliverables

### 1. Playwright suite (`tests/e2e/`)

`@playwright/test` (devDependency named here); `playwright.config.ts` with `baseURL` from
`E2E_BASE_URL`, `chromium` only, retries 1, trace on first retry, `testDir: 'tests/e2e'`.
Fixtures: `login(page, email, password)`, seeded credentials from env
(`E2E_MEMBER_EMAIL/PASSWORD` for a migrated all-access member, `E2E_ADMIN_EMAIL/PASSWORD/TOTP_SECRET`,
`E2E_BUYER_EMAIL_PREFIX` for throwaway buyers), Stripe test card helpers for the hosted
Checkout page (`4242 4242 4242 4242`, future expiry, any CVC, UK postcode). Specs:
`buy-single.spec.ts` (catalogue → product → cart → checkout with a new account → Stripe →
success → library shows the video → lesson plays (iframe `src` contains `token=`));
`buy-bundle-with-code.spec.ts` (code from `E2E_PROMO_CODE` reduces the total; success);
`locked-lesson.spec.ts` (anonymous sees unlock options; buyer of the single does not see a
bundle lesson); `member-course.spec.ts` (migrated member signs in, library lists the course,
a lesson plays, progress persists after reload); `refund-revokes.spec.ts` (uses the Stripe CLI
via `E2E_STRIPE_CLI=1` to `stripe trigger charge.refunded` with the order's payment intent, or
`test.skip(!process.env.E2E_STRIPE_CLI, 'needs stripe cli')`); `admin-bundle.spec.ts` (admin
with TOTP creates a bundle from two existing lessons, publishes, sees it in the catalogue;
`test.skip` with a reason when `E2E_ADMIN_TOTP_SECRET` is missing). `tests/e2e/.env.example`
lists every variable. Conditional `test.skip(condition, reason)` is allowed only in `tests/e2e`.

### 2. CI job

`.github/workflows/ci.yml` gains job `e2e` after `ci`, `if: ${{ secrets.E2E_BASE_URL != '' }}`
… (GitHub does not allow `secrets` in `if`; use a `vars.E2E_ENABLED == 'true'` variable
guard), `npx playwright install --with-deps chromium`, `npx playwright test`, artifacts on
failure. The default job keeps running without secrets.

### 3. Documentation

- `README.md`: purpose, architecture summary with a link to `docs/ARCHITECTURE.md`, local
  development (PGlite driver, seeds), the gate, E2E, deployment notes.
- `docs/ARCHITECTURE.md`: the v2 system as built (modules, data model, request pipeline,
  purchase and refund flows, access resolution), replacing the legacy document's content;
  `CLAUDE.md` refreshed to match reality (no stale phase references).
- `docs/runbooks/backfill.md`: rehearsal on a Neon branch, exact command order
  (`db:migrate`, `backfill --step media`, `product`, `orders`, `entitlements`, `promos`,
  `--dry-run` first), verification SQL (counts of members vs entitlements, payments vs orders,
  lessons with and without assets), rollback (`reset branch`).
- `docs/runbooks/launch.md`: the takeover steps from the analysis (beta subdomain, Stripe
  endpoint for v2 added before launch, Bunny webhook URL, Google OAuth URIs, domain move,
  rollback by moving the domain back, two-week retirement window), and the post-launch checks.
- `docs/runbooks/retire-legacy.sql` (**not** applied, not a Drizzle migration): the statements
  that drop `pricing_config`, `payments`, `profiles.email`, `profiles.is_member`,
  `lessons.video_url`, `lessons.lesson_type`, `lessons.content`, `lessons.duration_minutes`,
  `promo_codes.max_uses`, `promo_codes.current_uses`, `promo_codes.valid_from`,
  `promo_codes.valid_until`, `promo_codes.min_purchase_amount`, with the code changes each
  one requires listed as comments.
- `docs/analysis/README.md` gets a “Status” line pointing to the phase plan outcome.

### 4. Seeds for local development

`scripts/seed-dev.ts` (tsx): on a PGlite or Neon dev database, creates an admin (2FA off),
a member with the flagship, a bundle, two singles, lessons with fake `bunny:` refs, a promo
code; idempotent; documented in `README.md`.

### 5. Tests

`npx playwright test --list` exits 0 and lists the six spec files (asserted by a Vitest test
spawning it, or by the reviewer running it); `tests/docs.test.ts` asserts the four runbook/doc
files exist and that `docs/runbooks/retire-legacy.sql` is referenced nowhere under `drizzle/`.

Out of scope: running the E2E suite, any production operation.

## Steps

1. Playwright config + fixtures + specs; `npx playwright test --list`; commit.
2. CI job, commit.
3. Docs + runbooks + retirement SQL + seed script + tests, commit.
4. Gate once.

## Definition of Done

- [ ] `npx playwright test --list` succeeds and shows the six spec files; `tests/e2e/.env.example` documents every `E2E_*` variable read by the suite (grep both).
- [ ] The CI `e2e` job is guarded by a repository variable and does not run by default; the `ci` job is unchanged.
- [ ] `docs/ARCHITECTURE.md`, `docs/runbooks/backfill.md`, `docs/runbooks/launch.md`, `docs/runbooks/operations.md` (PHASE-21), `docs/runbooks/retire-legacy.sql` exist with the content described; `CLAUDE.md` and `README.md` describe the system as built (reviewer spot-checks three claims against code).
- [ ] `scripts/seed-dev.ts` runs twice on PGlite without error in a test and produces the listed rows once.
- [ ] No `.skip` outside `tests/e2e/`, and every skip there has a reason string.
- [ ] Gate green.
