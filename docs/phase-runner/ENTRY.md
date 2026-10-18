# Skyler's Sewing Secrets v2 — build constitution

This file is prepended to every builder and reviewer prompt. It states the mission, the
binding engineering rules, what the sandbox can and cannot do, and how work is verified.
Phase scoping is added by the runner; execute only your phase.

## Mission

Rebuild skylersewingsecrets.com as a catalogue: the flagship course (lifetime, all-access),
admin-defined bundles of videos, and standalone videos, bought through a cart and Stripe
Checkout, with per-product discount codes and an admin panel that uploads to Bunny Stream and
composes products from videos. Existing members keep their logins (same user ids, same bcrypt
hashes, Google sign-in) and keep **everything, forever**. The current look, copy and pages are
kept; the architecture is new.

The previous site is vendored read-only under `legacy/` (its `src/`, `seed/`, `drizzle/`,
Tailwind config, docs). The analysis that decided this build is under `docs/analysis/`:
`03-architecture.md` (stack, module layout, data model, flows), `04-admin-offers.md`,
`05-discounts.md`, `02-security-audit.md`, `06-new-approaches.md`. Phase files cite the
sections that bind them. Where a phase file and the analysis differ, the phase file wins.

"Done" for the product: a member of the old site signs in and owns everything; a visitor buys
a single video, a bundle or the course (with or without a code) and can watch exactly what
they bought; a refund removes that access; the admin uploads a video, publishes a product and
creates a scoped code without leaving the panel; every money path is covered by tests that run
without network access.

## Stack (fixed)

| Layer | Package / version | Notes |
|---|---|---|
| Framework | `@sveltejs/kit` **3.x**, `svelte` ≥ 5.57, `vite` 8, `@sveltejs/vite-plugin-svelte` 7, TypeScript 6 | SvelteKit 3 facts below are binding |
| Deployment | `@sveltejs/adapter-vercel` 7, `runtime: 'nodejs24.x'` | no edge runtime |
| Styling | `tailwindcss` 4 via `@tailwindcss/vite`, `@tailwindcss/forms`, `@tailwindcss/typography`, `@fontsource-variable/plus-jakarta-sans`, `@fontsource/cormorant-garamond` | tokens ported from `legacy/tailwind.config.js` |
| Database | `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` (`drizzle-orm/neon-serverless`, `Pool`), `@electric-sql/pglite` (`drizzle-orm/pglite`) | PGlite for tests and local dev; Neon in deployment; one `Db` type for both |
| Auth | `better-auth` ≥ 1.7 (`drizzleAdapter`, `sveltekitCookies`, `twoFactor`), `bcryptjs` | bcrypt keeps migrated passwords valid |
| Payments | `stripe` ≥ 23 | Checkout Sessions, webhooks, refunds |
| Validation / forms | `valibot`, `sveltekit-superforms` | Standard Schema everywhere |
| Content | `marked`, `sanitize-html` | Markdown in, sanitised HTML out, at save time |
| Uploads | `tus-js-client` | browser → Bunny Stream TUS endpoint |
| Tests | `vitest`, `@playwright/test` (written, not run here) | see Verification |
| Tooling | `eslint` + `eslint-plugin-svelte` + `typescript-eslint`, `prettier` + `prettier-plugin-svelte` + `prettier-plugin-tailwindcss`, `tsx` | npm is the package manager |

No other runtime dependency may be added unless a phase file names it. A dev dependency may
be added only when a phase names it or when it is a type package for one of the above. If the
registry refuses a listed version, report `blocked`; never edit `package-lock.json` by hand.

### SvelteKit 3 facts (the model's training may predate them)

- Configuration lives in `vite.config.ts` as options of the `sveltekit({...})` plugin:
  `adapter`, `csp`, `csrf.trustedOrigins`, `paths.origin`, `output`, `version`. There is no
  `svelte.config.js`.
- `$lib` is gone. `#lib` is declared in `package.json` `imports`
  (`"#lib": "./src/lib/index.js", "#lib/*": "./src/lib/*"`) and imports **include the file
  extension**: `import { x } from '#lib/shared/money.ts'` (TypeScript 6 with
  `allowImportingTsExtensions`/`rewriteRelativeImportExtensions` as `sv create` configures) or
  `.js`. Follow what the scaffold generates and stay consistent.
- Environment variables are declared once in `src/env.ts` with `defineEnvVars` from
  `@sveltejs/kit/env` and imported from `$app/env/private` or `$app/env/public`. A variable's
  `schema` runs at start **and at build**; required-at-runtime variables use
  `building ? v.optional(v.string()) : v.string()` (`building` from `$app/env`) so
  `npm run build` passes with no environment.
- `$app/environment` is `$app/env` (`dev`, `building`, `browser`, `version`). `$app/stores` is
  gone; use `$app/state`. `page.url` is read-only.
- Types: `Handle`, `HandleServerError` from `@sveltejs/kit/hooks`; `sequence` from
  `@sveltejs/kit/hooks`; `defineParams` from `@sveltejs/kit/params` in a single
  `src/params.ts`. `json()`/`text()` are deprecated: use `Response.json()`.
- `error(status, message)` takes a string second argument; extra fields go third.
  `handleError` receives every error (expected ones too) and may return `status`.
- `redirect()` to another origin needs `{ external: true }`.
- Cookies default to `path: '/'`.
- Any file or directory whose path contains a `server` segment is server-only (`src/lib/server/**`,
  `foo.server.ts`). Remote functions (`*.remote.ts`) are experimental and **not used**.
- Form actions return `fail(status, data)` and enhanced submissions now carry that status.
- `@sveltejs/adapter-vercel`: `isr`, `split`, `maxDuration` per route via
  `export const config`.

When unsure, ask the Svelte MCP server configured in `.mcp.json` (`list-sections`,
`get-documentation`) instead of guessing from memory.

## Architecture (fixed layout and rules)

```
src/
  env.ts                             typed env declarations (the only place env is read)
  params.ts                          param matchers (uuid, slug)
  hooks.server.ts                    wires createHandle() with the runtime container
  lib/
    shared/                          isomorphic: money.ts, slug.ts, dates.ts, schemas/** (valibot)
    components/{ui,layout,marketing,shop,course,admin}/
    server/
      runtime/                       composition root: env.ts (reads $app/env), container.ts (getServices())
      db/                            index.ts (createDb, Db type, withTx), schema/** (one file per module), backfill/**
      platform/                      adapters: stripe.ts, bunny.ts, resend.ts, logger.ts, request-limits.ts, fakes/**
      http/                          create-handle.ts (hook pipeline factory), security-headers.ts, event helpers
      modules/
        auth/  media/  content/  catalog/  entitlements/  commerce/  marketing/  admin/
          each: index.ts (public API + types), service.ts, queries.ts, *.test.ts
  routes/
    (marketing)/ (shop)/ (member)/ (auth)/ admin/ api/
tests/
  helpers/db.ts (createTestDb: PGlite + migrations), helpers/event.ts (fakeEvent), helpers/services.ts
  routes/** (load/action tests), backfill/**
drizzle/                             migrations; 0000 and 0001 copied verbatim from legacy
scripts/                             tsx CLIs (backfill, sync); vendor-legacy.sh
legacy/                              read-only reference; never imported, never edited
```

Binding rules:

1. **Routes are thin.** A `+page.server.ts` / `+server.ts` parses input with a schema from
   `src/lib/shared/schemas/**` (or superforms), checks access with `event.locals.access` /
   helpers from `modules/auth`, calls **one** service function from `event.locals.services`,
   and maps the result to `fail()` / `redirect()` / data. No `drizzle-orm` import under
   `src/routes/`. No business rule under `src/routes/`.
2. **Services are factories with explicit dependencies**: `createCatalogService({ db, log })`
   returns an object of functions. A module imports other modules only through their
   `index.ts`. Dependency direction: `commerce → catalog, entitlements, auth`;
   `entitlements → catalog`; `admin → everything`; nothing imports `commerce` except routes,
   webhooks and `admin`.
3. **Env is read in one place.** Only `src/lib/server/runtime/env.ts` imports
   `$app/env/private`; only `src/env.ts` declares variables. Modules, platform adapters and
   tests receive configuration as arguments. Nothing reads `process.env`.
4. **Platform adapters are interfaces** (`PaymentGateway`, `VideoHost`, `Mailer`, `Logger`)
   with a real implementation and an in-memory fake under `platform/fakes/`. Services depend
   on the interface. Tests use the fakes; **no test performs network I/O**.
5. **Writes that touch more than one row run in one transaction** through `withTx(db, fn)`
   (`db.transaction`); services accept an optional `tx`. Side effects (email, Bunny, Stripe
   writes) happen after commit, never inside the transaction.
6. **Authorization is decided on the server in every load, action and endpoint**, even when a
   layout or the hook already gated the route. Content access goes through
   `entitlements.canAccessLesson` / `accessibleLessonIds`; admin access through
   `isActiveAdmin`. A suspended account is neither a member nor an admin.
7. **Money is integer pence.** Prices, discounts and totals are `integer` columns; formatting
   happens in `src/lib/shared/money.ts` only.
8. **Content HTML is produced by the sanitiser.** `{@html}` may render only `*_html` columns
   written by `modules/content/markdown.ts` (marked + sanitize-html with the allow-list it
   defines) or inline SVG constants. Never user input.
9. **Every admin mutation writes `audit_log`** (actor, action, entity, id, before/after) in the
   same transaction. **Every webhook is idempotent** through `webhook_events` (provider +
   event id unique).
10. **Schema and migrations**: `drizzle/0000_*` and `0001_*` are byte-identical to
    `legacy/drizzle/` and are never edited. New migrations are generated with
    `npm run db:generate`, reviewed, and must be additive against legacy tables (no `DROP`, no
    `SET NOT NULL` without a default on an existing table). Table and column names stay
    `snake_case`; Better Auth tables keep the camelCase property / snake_case column pattern
    from `legacy/src/lib/server/db/schema.ts`.
11. **No PII in logs.** Log ids and statuses; the logger redacts fields named `email`,
    `name`, `password`, `token`. No `console.log` in `src/` (the logger wraps console).
12. **Code style**: TypeScript everywhere, Svelte 5 runes (`$props`, `$state`, `$derived`,
    `$effect`), `{#snippet}`/`{@render}`, no `any`, tabs, single quotes, kebab-case files,
    PascalCase components, `interface Props` + `let {...}: Props = $props()`. Prettier and
    ESLint configurations are part of PHASE-01 and are enforced by the gate.
13. **Keep the look.** Visual tokens, class names and copy come from `legacy/`; port, do not
    redesign. New screens (catalogue, cart, admin products) use the same tokens and
    components.
14. **Commits**: conventional (`feat(scope):`, `fix:`, `test:`, `chore:`, `docs:`), one
    logical change per commit, body says why when not obvious. Never commit `.env*` except
    `.env.example`.

## What the sandbox can and cannot do

- Node 24 and npm, outbound network to the npm registry. **No database server, no Docker, no
  browsers, no Stripe/Bunny/Resend/Google/Vercel credentials.** Do not try to install or
  start any of them; do not create `.env` files.
- Postgres behaviour is verified on **PGlite** (`@electric-sql/pglite`) through
  `tests/helpers/db.ts`, which applies every migration under `drizzle/`. Anything that needs
  a real Neon connection, Stripe, Bunny or a browser is verified by a human after the batch
  and is listed as such in the phase file; do not fake it, do not mark it done.
- `npm run build` must succeed with **no environment variables set** (`env -i PATH="$PATH"
  HOME="$HOME" npm run build` is how the reviewer checks it).
- `legacy/` is reference only. Read it freely; never import from it, never edit it, never
  include it in tooling (tsconfig, eslint, prettier, vitest all exclude it).
- Playwright tests are written and `npx playwright test --list` must parse them, but they are
  not executed here (no browsers).

## Verification — the gate, from the project root

```
npm run check     # svelte-check: 0 errors, 0 warnings (new code) — legacy excluded
npm run lint      # eslint + prettier --check
npm run build     # production build with no env vars
npm test          # vitest run: unit + PGlite-backed service/route tests, nothing skipped
```

Test rules: tests live next to the module (`*.test.ts`) or under `tests/`; `createTestDb()`
gives a fresh PGlite database with all migrations applied (one per test file, truncate
between tests); platform fakes replace Stripe/Bunny/Resend; `vi.mock` is allowed only for
`$app/env/*` and `$app/server` (`getRequestEvent`) when a module unavoidably touches them —
never for the module under test. No `.skip`, `.only`, `.todo`, no vacuous assertions. Each
phase's Definition of Done names the tests that must exist; the reviewer reads them.

## Domain facts every phase relies on

- Existing tables (names, columns, types) are the ones in `legacy/src/lib/server/db/schema.ts`;
  the production Neon database already has them, populated. Lifetime members have
  `profiles.is_member = true`; admins `is_admin = true`; suspension `is_suspended`.
- The flagship course is the one `products` row with `access_scope = 'all'`: it grants every
  lesson, current and future. Bundles and singles list lessons in `product_items`. A standalone
  video is a `lessons` row with `module_id IS NULL`.
- Access: `canAccessLesson(user, lesson)` = free preview, or admin, or an unrevoked
  entitlement whose product has `access_scope = 'all'` or contains the lesson; a suspended
  user has no access. `profiles.is_member` is kept in sync (true iff an active all-access
  entitlement exists) until the legacy app is retired.
- Prices are pence (`14900` = £149.00). Stripe refuses GBP amounts under 30p. Currency is GBP.
- Bunny Stream: a video is `{ libraryId, videoId }`; embed URL
  `https://iframe.mediadelivery.net/embed/{lib}/{video}?autoplay=false&preload=true` plus
  `&token=sha256hex(key + videoId + expires)&expires=<unix seconds>`; the key is
  `BUNNY_EMBED_TOKEN_KEY` and is **required** in production (fail closed). TUS upload ticket:
  `AuthorizationSignature = sha256hex(libraryId + apiKey + expirationTime + videoId)`,
  `AuthorizationExpire`, `VideoId`, `LibraryId`; endpoint `https://video.bunnycdn.com/tusupload`.
  Library API: `https://video.bunnycdn.com/library/{lib}/videos` with header `AccessKey`.
  Webhook payload `{ VideoLibraryId, VideoGuid, Status }` (3 encoding, 4 finished, 5 failed) is
  a hint; the handler re-fetches the video.
- Stripe: Checkout Session in `mode: 'payment'`, `client_reference_id = order.id`,
  `metadata.order_id`, idempotency key = order id. Events handled:
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
  `charge.dispute.created`. `payment_status === 'paid'` is required before fulfilment.
- Better Auth: tables `users`, `sessions`, `accounts`, `verifications` (plural, as in legacy)
  plus the plugin tables added in PHASE-04; `emailAndPassword.disableSignUp = true`
  (accounts are created by checkout and Google), bcrypt `hash`/`verify`,
  `revokeSessionsOnPasswordReset = true`, `rateLimit: { enabled: true, storage: 'database' }`,
  account linking with `trustedProviders: ['google']`, `generateId` = `crypto.randomUUID()`.
- Email sender is Resend over its HTTP API (`https://api.resend.com/emails`, bearer key).

## Environment variables (declared in `src/env.ts` by PHASE-01)

Required at runtime: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `PUBLIC_SITE_URL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`BUNNY_VIDEO_LIBRARY_ID`, `BUNNY_VIDEO_API_KEY`, `BUNNY_EMBED_TOKEN_KEY`,
`BUNNY_STREAM_CDN_HOST`, `PUBLIC_BUNNY_CDN_URL`, `BUNNY_STORAGE_ZONE`,
`BUNNY_STORAGE_API_KEY`, `CONTACT_EMAIL`, `CRON_SECRET`.
Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google sign-in off when absent),
`SENTRY_DSN`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `REVALIDATE_BYPASS_TOKEN`,
`DATABASE_DRIVER` (`neon` default; `pglite` for local development with `DATABASE_URL`
`pglite://./.pglite`).

## Known gotchas

- `drizzle-kit generate` diffs the schema against the last snapshot in `drizzle/meta/`; the
  legacy snapshots are the baseline, so existing tables must be declared exactly as legacy
  does or the generator will emit destructive SQL. Phase 03's DoD is that `generate` is a
  no-op before any extension is added.
- PGlite is single-connection: concurrency tests are sequential double-calls, not parallel
  transactions. Say so in the test name.
- `drizzle-orm/pglite/migrator` and `drizzle-orm/neon-serverless/migrator` both exist; tests
  use the PGlite one against `./drizzle`.
- Better Auth's `sveltekitCookies(getRequestEvent)` plugin needs a request event; in tests
  call `auth.api.*` with `headers` and `returnHeaders: true` (or `asResponse: true`) and read
  `set-cookie` yourself.
- `svelte/server` exports `render(Component, { props })` for SSR tests in Node — use it for
  component tests instead of a browser.
- superforms: `superValidate(request, valibot(schema))` with the adapter from
  `sveltekit-superforms/adapters`; it serialises form state through `devalue`, so keep schema
  outputs plain.
- Stripe's `webhooks.constructEventAsync` is the WebCrypto-friendly variant; the fake gateway
  skips signature checks and the real one never does.
- The reviewer checks `env -i PATH="$PATH" HOME="$HOME" npm run build`; a module that reads
  env at import time breaks it.

If a Definition of Done item is genuinely unreachable, deliver every other item, commit, and
report `blocked` with what is missing. Never fake green, never soften the DoD.
