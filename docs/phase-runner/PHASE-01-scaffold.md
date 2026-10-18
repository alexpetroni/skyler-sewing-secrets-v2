# PHASE-01 — Scaffold: SvelteKit 3 project, tooling, typed env, CI

## Why

Nothing exists yet except `docs/`, `scripts/`, `static/` (vendored images) and `legacy/`.
Every later phase assumes the toolchain in the entry file: SvelteKit 3 with config in
`vite.config.ts`, `#lib` imports, typed env that lets the build run without variables, Tailwind
4, Vitest, ESLint, Prettier, a gate that is green on an empty app, and a CI workflow.

## Read first

`docs/analysis/03-architecture.md` (Stack, Modular monolith layout), `legacy/package.json`
(scripts and conventions to mirror), `legacy/.env.example`, `legacy/CLAUDE.md`.

## Deliverables

### 1. Project scaffold

- `npx sv create --template minimal --types ts --no-add-ons --no-install --no-dir-check .`
  then `npx sv add prettier eslint vitest="usages:unit" tailwindcss="plugins:forms,typography" sveltekit-adapter="adapter:vercel" --no-git-check --install npm`.
  If the scaffold is SvelteKit 2, run `npx sv migrate sveltekit-3` and upgrade until
  `@sveltejs/kit` is 3.x, `svelte` ≥ 5.57.1, `vite` 8.x, `@sveltejs/vite-plugin-svelte` 7.x,
  `typescript` ≥ 6. Package manager is npm; commit `package-lock.json`.
- `vite.config.ts`: `sveltekit({ adapter: adapter({ runtime: 'nodejs24.x' }), csrf: { trustedOrigins: [] } })`,
  the Tailwind Vite plugin, and the Vitest `test` block
  (`include: ['src/**/*.test.ts', 'tests/**/*.test.ts']`, `environment: 'node'`,
  `exclude: ['legacy/**', 'node_modules/**', 'tests/e2e/**']`).
- `package.json` `imports` for `#lib` as the entry file states; `"engines": { "node": ">=24" }`;
  scripts: `dev`, `build`, `preview`, `check` (`svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`),
  `lint` (`prettier --check . && eslint .`), `format`, `test` (`vitest run`),
  `test:watch`, `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`).
  `db:*` scripts may reference a `drizzle.config.ts` that PHASE-03 creates; add the scripts now.
- `tsconfig.json` extends `$app/tsconfig`, `include: ["src", "tests", "scripts", "*.ts", "*.js"]`,
  `exclude: ["legacy", "node_modules", ".svelte-kit", "build", ".vercel"]`, `strict: true`.
- `.prettierrc`: tabs, single quotes, `printWidth: 100`, `trailingComma: 'none'`,
  plugins `prettier-plugin-svelte` and `prettier-plugin-tailwindcss`. `.prettierignore` and the
  ESLint config ignore `legacy/`, `.svelte-kit/`, `build/`, `.vercel/`, `static/`,
  `package-lock.json`, `drizzle/`.
- `.gitignore`: node_modules, `.svelte-kit`, `build`, `.vercel`, `.env`, `.env.*` except
  `.env.example`, `.pglite/`, `test-results/`, `playwright-report/`.
- `.nvmrc` = `24`.

### 2. Typed environment

`src/env.ts` declares **every** variable listed in the entry file ("Environment variables")
with `defineEnvVars`: required-at-runtime ones use `schema: building ? v.optional(v.string()) : v.pipe(v.string(), v.minLength(1))`;
optional ones `v.optional(v.string())`; `PUBLIC_SITE_URL` and `PUBLIC_BUNNY_CDN_URL` are
`public: true` and validated as URLs when present; `DATABASE_DRIVER` is optional with
`v.optional(v.picklist(['neon', 'pglite']), 'neon')`. Each has a one-line `description`.
`valibot` is added as a runtime dependency here. `.env.example` lists every variable with a
comment and a placeholder, grouped as in the entry file.

### 3. First shared module and test

`src/lib/shared/money.ts` exporting `formatPence(pence: number, currency = 'GBP'): string`
(en-GB, two decimals) and `parsePounds(input: string): number | null` (pounds with optional
decimals → pence, rejects negatives and more than two decimals). `src/lib/shared/money.test.ts`
covers: `14900 → '£149.00'`, `30 → '£0.30'`, `parsePounds('149') → 14900`,
`'149.5' → 14950`, `'149.555' → null`, `'-1' → null`, `'abc' → null`. This proves `#lib`
resolution, Vitest and the TypeScript configuration end to end.

### 4. App shell placeholders

`src/app.html` (lang `en`, viewport, `%sveltekit.head%`, body with `data-sveltekit-preload-data="hover"`),
`src/app.css` importing Tailwind (`@import 'tailwindcss'; @plugin '@tailwindcss/forms'; @plugin '@tailwindcss/typography';`),
`src/routes/+layout.svelte` importing it and rendering `{@render children()}`,
`src/routes/+page.svelte` with the site name in an `<h1>`, `src/app.d.ts` with an empty
`App.Locals` and `App.Error { message: string; errorId?: string }`.

### 5. CI and docs

- `.github/workflows/ci.yml`: on push to all branches and pull requests; `permissions:
  contents: read`; concurrency per ref; Node 24 with npm cache; `npm ci`, `npm run check`,
  `npm run lint`, `npm run build`, `npm test`. No secrets.
- `CLAUDE.md` (project conventions for interactive sessions): a condensed copy of the entry
  file's Architecture rules, Stack table, verification commands and SvelteKit 3 facts, under
  150 lines. `README.md`: what the project is, local setup (`npm ci`, `.env` from
  `.env.example`, `DATABASE_DRIVER=pglite DATABASE_URL=pglite://./.pglite npm run dev` once
  PHASE-03 lands), the four gate commands, a pointer to `docs/analysis/README.md`.

Out of scope: database code, auth, any page beyond the placeholder, Playwright, Sentry.

## Steps

1. Scaffold, verify versions (`npm ls @sveltejs/kit svelte vite typescript`), commit
   `chore: scaffold SvelteKit 3 project`.
2. Tooling config (prettier, eslint, tsconfig, ignores, scripts), commit.
3. `src/env.ts` + `.env.example`, commit.
4. `money.ts` + test, commit.
5. CI, `CLAUDE.md`, `README.md`, commit.
6. Run the four gate commands once at the end; also
   `env -i PATH="$PATH" HOME="$HOME" npm run build`.

## Definition of Done

- [ ] `npm ls @sveltejs/kit svelte vite @sveltejs/vite-plugin-svelte typescript @sveltejs/adapter-vercel tailwindcss` shows kit 3.x, svelte ≥ 5.57.1, vite 8.x, vite-plugin-svelte 7.x, typescript ≥ 6, adapter-vercel 7.x, tailwindcss 4.x; no `svelte.config.js` exists.
- [ ] `package.json` has the `imports` map for `#lib`, the listed scripts, `engines.node >= 24`; `.nvmrc` is `24`.
- [ ] `src/env.ts` declares every variable named in the entry file (reviewer diffs the two lists) with descriptions; required ones are optional only when `building`.
- [ ] `env -i PATH="$PATH" HOME="$HOME" npm run build` succeeds.
- [ ] `src/lib/shared/money.test.ts` exists with the seven listed cases and `npm test` passes with 0 skipped.
- [ ] `npm run check` reports 0 errors and 0 warnings; `npm run lint` passes; `legacy/` is excluded from tsconfig, eslint, prettier and vitest (reviewer greps the configs).
- [ ] `.github/workflows/ci.yml` runs `npm ci`, check, lint, build, test on Node 24 with `contents: read` and a concurrency group.
- [ ] `.env.example` documents every declared variable; no `.env` file is committed.
- [ ] `CLAUDE.md` and `README.md` exist with the content described; neither mentions `$lib` or `svelte.config.js`.
