# Skyler's Sewing Secrets v2 — analysis

Date: 2026-10-18. Source analysed: `/home/alex/work/skyler-sewing-secrets`, branch
`vercel-neon-migration` at `136425c` (plus `main`, `vercel`, `lite` for history): every server
module and route handler, the schema, migrations (Drizzle and legacy Supabase RLS), seeds and
scripts were read in full; Svelte components were read selectively (player, header, pricing,
checkout, lesson page) and scanned for `{@html}` and client-side calls. `npm run check`, `npm test`
and `npm audit` were run on the branch.
This directory is the future home of the v2 code; nothing has been scaffolded yet.

**Status (2026-10-19):** v2 is built in this directory by the 22-phase plan in
`docs/phase-runner/README.md`; the checks only a human can do (Neon, Stripe, Bunny, browsers) are
listed there under “What only a human can verify after the batch”. The system as built is
described in `docs/ARCHITECTURE.md`; the remaining launch work is in `docs/runbooks/backfill.md`
and `docs/runbooks/launch.md`. The analysis below is kept as written.

## Decisions taken with the owner (2026-10-18)

| Question | Decision |
|---|---|
| Production state | Still on Supabase (`vercel` branch). Neon not created. |
| Cutover vs rebuild | Cut the existing hardened Neon branch over **first**; build v2 against the same Neon database with additive schema changes. |
| Rebuild scope | Greenfield code in this directory, same stack family, **keep the current look and copy**. |
| Existing lifetime members | Keep **everything, forever**: an all-access entitlement covering every current and future video, bundle and course. |
| Sellable units | The whole course (flagship), **admin-defined bundles**, **standalone videos** outside the course. Individual course lessons are not sold on their own. |
| Checkout | **Cart** with several products, one payment; no upgrade credit for already-owned items. |
| Discount codes | **In-house promo engine**, each code scoped to one product, a set, or all. Applied on our checkout page before Stripe. |
| Admin ↔ Bunny | Admin **browses the Bunny Stream library and uploads** videos from the panel (TUS). |

## Executive summary

1. **The database move is 90% done in code and 0% done in production.** The Neon branch contains
   every production commit, Better Auth with preserved UUIDs and bcrypt hashes, a tested idempotent
   migration script, and 15 hardening phases. What remains is operational: create Neon via the
   Vercel Marketplace, rehearse the copy, cut over in a one-hour window. The branch also ships an
   unreleased visual redesign; the owner must approve it on a preview. → `01-neon-cutover.md`
2. **Eight security items should be fixed on that branch before it goes live**, all small:
   patched Svelte (published XSS advisories), sessions revoked on password reset (closes an
   account-squatting chain opened by pre-payment account creation), removal of “admin by purchase”,
   WAF rate-limit rules (the default in-memory limiter does nothing on Vercel), mandatory signed
   Bunny embeds (paid videos are currently shareable by URL), no emails in logs, key rotation.
   None of them changes the schema. Refund handling, CSP, content sanitisation, the database-backed
   rate limiter and transactional writes belong in v2. → `02-security-audit.md`
3. **The current code cannot express the new product.** Access is one boolean, price is one row,
   promo codes are global, videos are strings, and business logic lives in 300-line route files.
   v2 is a modular monolith on SvelteKit 3 / Svelte 5 / Tailwind 4 / Drizzle on Neon (WebSocket
   driver for transactions) / Better Auth, organised by domain modules (catalog, media, content,
   commerce, entitlements, marketing, admin) with a products → product_items → entitlements model
   where the course is the single `access_scope = 'all'` product. → `03-architecture.md`
4. **Admin builds offers from videos**: upload or import from Bunny, attach to a lesson (course or
   standalone), compose bundles with an item picker, price, publish. Orders, entitlements, grants,
   refunds and an audit log make support questions answerable. → `04-admin-offers.md`
5. **Discounts become per-product** with exact redemption counting, per-user caps, pro-rata
   distribution across cart lines, sale prices without codes, and a single validity predicate used
   both when applying and when charging. → `05-discounts.md`
6. **New approaches** worth taking at launch: locked-lesson upsell, resume playback, Stripe-chosen
   payment methods and invoices, refund webhooks, Neon branch per preview, Sentry, Playwright on
   previews, GDPR deletion, newsletter double opt-in. → `06-new-approaches.md`

## Documents

| File | Covers request item |
|---|---|
| `01-neon-cutover.md` | 1 — moving the database from Supabase to Neon on Vercel: state, runbook, rollback, risks |
| `02-security-audit.md` | 2 — security findings by severity with file references; pre-cutover checklist |
| `03-architecture.md` | 3 — reverse engineering of the current system; v2 stack, module layout, data model, flows, migration of data into the v2 schema, how v2 takes over production |
| `04-admin-offers.md` | 4 — admin panel for products with one or more videos; Bunny browse/upload; orders and users |
| `05-discounts.md` | 5 — per-product discount codes: model, arithmetic, Stripe, admin UI, edge cases |
| `06-new-approaches.md` | 6 — suggestions ranked by value for effort, and options deliberately not taken |

## Recommended sequence

Rough effort for one experienced developer working with an AI assistant; calendar time is longer
because of owner reviews, DNS and Stripe lead times.

| Phase | Content | Effort |
|---|---|---|
| 0 · Cutover | pre-cutover security fixes, Neon via Vercel, rehearsal, owner approval of the redesign, cutover, 30-day Supabase retention | 3–5 days over 1–2 weeks |
| 1 · Foundation | scaffold SK3 + Tailwind 4 in this directory, port the design system and marketing pages, Better Auth config (2FA, DB rate limit), Drizzle modules, hooks, typed env, Sentry, CI, Playwright skeleton | 1–2 weeks |
| 2 · Catalogue & access | media/content/catalog/entitlements modules, backfill scripts (additive, against the live Neon DB), member library, lesson access through entitlements | 1–2 weeks |
| 3 · Commerce | cart, promo engine, orders, Stripe Checkout, webhooks (paid, refund, dispute), fulfilment, emails, cron for expiry | 2 weeks |
| 4 · Admin | products, videos (Bunny browse + TUS upload + webhook), promotions, orders, users, content editors with Markdown, audit log | 2–3 weeks |
| 5 · Launch | E2E suite, security pass (CSP, sanitiser, headers), beta on a subdomain with real data, owner acceptance, domain switch, retire old tables after two weeks | 1–2 weeks |

Total ≈ 8–12 weeks of development. Phases 1–4 can start the day after Phase 0's rehearsal
succeeds; nothing in them blocks on the cutover itself.

## This week

1. Owner reviews this analysis and the redesign on a preview deployment of `vercel-neon-migration`.
2. Apply the pre-cutover checklist from `02-security-audit.md` on that branch (one commit each, CI
   green).
3. Create Neon through the Vercel Marketplace in the London region, set the function region to
   match, add the environment variables, run the schema migration and the rehearsal copy.
4. Pick the cutover slot and send the member notice.
5. In parallel: scaffold v2 here (`npx sv create`, SvelteKit 3, Tailwind 4) and start porting the
   design tokens.

## Assumptions and out of scope

- GBP only at launch; tax handling is an owner decision (Stripe Tax is a switch, not a schema
  change).
- No subscriptions, no gifting UI, no multi-language at launch.
- Marketing copy, imagery and the “Editorial Luxury” design system are reused, not redesigned.
- The old `main`, `vercel` and `lite` branches are history only; `main` fast-forwards to the Neon
  branch at cutover.
