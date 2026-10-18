# Building v2 with claude-phase-runner

The plan is 22 phase files in this directory plus `ENTRY.md` (the constitution prepended to
every builder and reviewer prompt). The runner configuration lives in `.phase-runner/`
(`runner.env`, `phases`, the agent home with the SvelteKit/Tailwind skill), excluded from git.

| Stage | Phases | What exists afterwards | Builder model |
|---|---|---|---|
| A · Foundation | 01 scaffold · 02 design system · 03 database baseline · 04 schema extensions · 05 auth · 06 platform adapters | a SvelteKit 3 app that builds with no env, the full schema with additive migrations and backfill scripts, Better Auth compatible with the migrated users, Stripe/Bunny/Resend adapters with fakes, PGlite test harness | Fable on 01, 03, 04, 05; Opus otherwise |
| B · Catalogue & access | 07 media + content · 08 catalog + entitlements · 09 marketing services · 10 public pages · 11 member area | the content and product model, entitlement-based access, all public pages ported, the member library and lesson pages | Fable on 08 |
| C · Commerce | 12 pricing + promo + cart · 13 shop pages · 14 checkout + orders · 15 fulfilment + webhooks | catalogue, product pages, cart, scoped codes, Stripe Checkout, idempotent fulfilment, refund revocation, order expiry job | Fable on 12, 14, 15 |
| D · Admin | 16 shell + users + orders · 17 content + media (Bunny browse/upload) · 18 catalogue + promotions · 19 marketing + settings | the whole admin panel with audit log | Opus |
| E · Launch | 20 security hardening · 21 observability + ops · 22 E2E + docs + launch runbook | CSP, admin 2FA, rate limits, GDPR deletion, Sentry, cron, Playwright suite, final docs | Fable on 20; Sonnet on 21 |

Rough cost from the kit's measurements (build $2–30 and 8–80 min per phase, reviewer +15–30%,
a fix round +30–55%): expect $150–400 and two to four days of wall-clock for the batch, less
on a subscription where the constraint is the usage window.

## One-time setup (human)

```bash
cd ~/work/skyler-sewing-secrets-v2

# 1. A git repository with a push remote (the runner pushes every verified phase).
git init -b main
gh repo create skyler-sewing-secrets-v2 --private --source=. --remote=origin   # or create it in the UI
#    SSH remote → the launching terminal needs an agent with the key: `ssh-add -l`.

# 2. Vendor the legacy site for the builders (they only see this directory). Already run once
#    (legacy/ and static/ exist). Re-run only if the legacy branch changes; it must never gain
#    a migration, because v2's Phase 03 copies legacy/drizzle/ as its migration baseline.
scripts/vendor-legacy.sh ../skyler-sewing-secrets vercel-neon-migration

# 3. Runner bookkeeping (keeps the pre-written runner.env/phases, adds .git/info/exclude).
phase-runner init

# 4. Credentials, once per machine (template in the kit): ~/.config/claude-phase-runner/credentials.env

# 5. Commit the plan and the reference material.
git add -A && git commit -m "docs: v2 analysis, phase plan and vendored legacy reference" && git push -u origin main

# 6. Dry run, preflight, then build in tmux.
phase-runner build --dry-run      # prints the PHASE-01 builder prompt, launches nothing
phase-runner preflight            # tooling assessment → .phase-runner/state/TOOLING.md
phase-runner build                # Ctrl-C is safe at any time; re-run resumes

# 7. Watch from another terminal.
phase-runner status
phase-runner logs -f
phase-runner logs driver -f
```

Notes:

- The agent home already contains the `sveltekit-svelte5-tailwind-skill` (copied from
  `~/.claude/skills/`) and `.mcp.json` points at the official Svelte MCP server, so builders
  can look up SvelteKit 3 and Tailwind 4 details instead of guessing.
- `DOCKER_SOCKET=0`: nothing in the plan needs containers. Tests run on PGlite inside the
  runner process.
- Every phase is a fresh context. The phase files therefore repeat the contracts they depend
  on and name the files to read first. Resist shortening them.
- A blocked phase stops the run. Read `.phase-runner/state/reviews/<phase>.md`, fix the plan
  or the code, re-run; completed phases are skipped.
- `phase-runner review` after the batch gives an adversarial pass; accepted findings become
  PHASE-23+ files appended to `.phase-runner/phases`.

## What only a human can verify after the batch

The sandbox has no database server, no browsers and no third-party credentials. These are
deliberately outside every Definition of Done:

1. **Neon**: create a Neon branch from production, run `npm run db:migrate` against it, then
   the backfill CLIs (`scripts/backfill/*.ts`) in order, and the verification queries in
   `docs/runbooks/backfill.md` (PHASE-22). Only then run them against production.
2. **Vercel**: new project linked to this repository, same Neon integration, env vars from
   `.env.example`, function region = Neon region, `beta.<domain>` attached; cron entries from
   `vercel.json` appear in the dashboard.
3. **Stripe**: a test-mode webhook endpoint on the preview URL; `stripe trigger
   checkout.session.completed`; one real 30p-plus purchase on beta with a 99% code.
4. **Bunny**: embed token authentication on, referrer allow-list, MP4 fallback off, webhook URL
   set to `https://beta.<domain>/api/webhooks/bunny`; one upload from the admin.
5. **Playwright**: `npx playwright test` against the preview URL with the secrets in
   `tests/e2e/.env.example`; the CI job runs only when those secrets exist.
6. **Google OAuth**: redirect URI for the beta and production hosts.
7. **Launch**: the runbook in `docs/runbooks/launch.md` (domain move, webhook switch, retire
   legacy columns after two weeks).

## The pre-cutover fixes on the legacy repository

They are not part of this plan. The legacy repository already has a runner setup
(`.phase-runner/` on `vercel-neon-migration`); the seven items in
`docs/analysis/02-security-audit.md` → “Pre-cutover checklist” fit one phase file there
(`docs/phase-runner/PHASE-16-pre-cutover-fixes.md`) with the existing gate. Write it from the
checklist when you schedule the cutover. The one rule that protects this plan: that phase must
not add a table, a column or a migration. Both apps share the Neon database, and v2 owns every
schema change from here on.
