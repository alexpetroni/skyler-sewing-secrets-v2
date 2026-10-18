# Skyler's Sewing Secrets v2

Catalogue rebuild of skylersewingsecrets.com: flagship course (lifetime, all-access), admin-defined
bundles and standalone videos, bought through a cart and Stripe Checkout. Existing members keep
their logins and everything they own. The look, copy and pages are kept; the architecture is new.

The previous site is vendored read-only under `legacy/` (never imported, never edited, excluded
from all tooling). Analysis lives in `docs/analysis/`; the phase plan in `docs/phase-runner/`.

## Stack (fixed; add nothing else unless a phase names it)

| Layer      | Packages                                                                                |
| ---------- | --------------------------------------------------------------------------------------- |
| Framework  | `@sveltejs/kit` 3, `svelte` ≥ 5.57, `vite` 8, `@sveltejs/vite-plugin-svelte` 7, TS 6    |
| Deployment | `@sveltejs/adapter-vercel` 7, `runtime: 'nodejs24.x'`, no edge                          |
| Styling    | `tailwindcss` 4 via `@tailwindcss/vite`, forms + typography plugins, fontsource fonts   |
| Database   | `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` (prod), `@electric-sql/pglite` |
| Auth       | `better-auth` ≥ 1.7 (drizzleAdapter, sveltekitCookies, twoFactor), `bcryptjs`           |
| Payments   | `stripe` ≥ 23: Checkout Sessions, webhooks, refunds                                     |
| Validation | `valibot`, `sveltekit-superforms`                                                       |
| Content    | `marked`, `sanitize-html` (sanitised at save time)                                      |
| Uploads    | `tus-js-client` → Bunny Stream                                                          |
| Tests      | `vitest`, `@playwright/test` (written, not run locally)                                 |
| Tooling    | eslint, prettier (+svelte, +tailwindcss plugins), tsx; npm                              |

## Verification (the gate, from the project root)

```
npm run check     # svelte-check: 0 errors, 0 warnings
npm run lint      # prettier --check . && eslint .
npm run build     # must pass with NO env vars: env -i PATH="$PATH" HOME="$HOME" npm run build
npm test          # vitest run: unit + PGlite-backed tests, nothing skipped
```

Tests sit next to the module (`*.test.ts`) or under `tests/`. `createTestDb()` gives a fresh
PGlite database with all migrations applied. Platform fakes replace Stripe/Bunny/Resend; no test
performs network I/O. `vi.mock` only for `$app/env/*` and `$app/server`, never the module under
test. No `.skip`, `.only`, `.todo`, no vacuous assertions.

## SvelteKit 3 facts

- Config lives in `vite.config.ts` as options of `sveltekit({...})` (`adapter`, `csp`,
  `csrf.trustedOrigins`, `paths`, `output`, `version`). There is no Svelte config file.
- Imports use `#lib` (declared in `package.json` `imports`) and include the file extension:
  `import { x } from '#lib/shared/money.ts'`. The old dollar-prefixed lib alias is gone.
- Env vars are declared once in `src/env.ts` with `defineEnvVars` and imported from
  `$app/env/private` or `$app/env/public`. Schemas run at start and at build; required-at-runtime
  variables use `building ? v.optional(v.string()) : v.string()` so the build needs no env.
- `$app/env` exports `dev`, `building`, `browser`, `version`. Use `$app/state`, not stores.
- `Handle`, `HandleServerError`, `sequence` come from `@sveltejs/kit/hooks`; `defineParams` from
  `@sveltejs/kit/params` in a single `src/params.ts`. Use `Response.json()`, not `json()`.
- `error(status, message)` takes a string; `redirect()` to another origin needs
  `{ external: true }`; cookies default to `path: '/'`; form actions return `fail(status, data)`.
- Any path containing a `server` segment is server-only. Remote functions are not used.
- When unsure, ask the Svelte MCP server (`list-sections`, `get-documentation`).

## Architecture rules (binding)

```
src/env.ts  params.ts  hooks.server.ts
src/lib/shared/            isomorphic: money, slug, dates, schemas/** (valibot)
src/lib/components/{ui,layout,marketing,shop,course,admin}/
src/lib/server/runtime/    composition root: env.ts (only $app/env/private reader), container.ts
src/lib/server/db/         index.ts (createDb, Db, withTx), schema/**, backfill/**
src/lib/server/platform/   stripe, bunny, resend, logger, request-limits, fakes/**
src/lib/server/http/       create-handle.ts, security-headers.ts
src/lib/server/modules/    auth media content catalog entitlements commerce marketing admin
src/routes/                (marketing)/ (shop)/ (member)/ (auth)/ admin/ api/
tests/ drizzle/ scripts/ legacy/
```

1. Routes are thin: parse with a shared schema, check access, call one service from
   `event.locals.services`, map to `fail()`/`redirect()`/data. No drizzle or business rules in routes.
2. Services are factories with explicit deps (`createCatalogService({ db, log })`). Modules import
   each other only via `index.ts`. `commerce → catalog, entitlements, auth`; `entitlements →
catalog`; `admin → everything`; only routes, webhooks and `admin` import `commerce`.
3. Env is read in one place (`src/lib/server/runtime/env.ts`); nothing reads `process.env`.
4. Platform adapters are interfaces (`PaymentGateway`, `VideoHost`, `Mailer`, `Logger`) with a
   real implementation and an in-memory fake. Services depend on the interface.
5. Multi-row writes run in one transaction via `withTx`; side effects happen after commit.
6. Authorization is decided on the server in every load, action and endpoint. A suspended account
   is neither a member nor an admin.
7. Money is integer pence; formatting only in `src/lib/shared/money.ts`.
8. `{@html}` renders only sanitised `*_html` columns or inline SVG constants.
9. Every admin mutation writes `audit_log` in the same transaction; every webhook is idempotent
   through `webhook_events`.
10. `drizzle/0000_*` and `0001_*` are byte-identical to legacy and never edited; new migrations are
    additive. Names stay `snake_case`.
11. No PII in logs; no `console.log` in `src/` (the logger wraps console).
12. TypeScript everywhere, Svelte 5 runes, snippets, no `any`, tabs, single quotes, kebab-case
    files, PascalCase components, `interface Props` + `let {...}: Props = $props()`.
13. Keep the look: tokens, class names and copy come from `legacy/`; port, do not redesign.
14. Conventional commits, one logical change each. Never commit `.env*` except `.env.example`.
