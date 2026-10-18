# PHASE-02 — Design system port: tokens, base styles, UI kit, layout shell

## Why

The owner keeps the current look. The legacy "Editorial Luxury" design system lives in
`legacy/tailwind.config.js` (palette, fonts, radii, letter-spacing, easing) and
`legacy/src/app.css` (base layer, component classes such as `.btn-primary`, `.shell-lg`,
`.eyebrow`, `.section-title`, `.container-default`), plus the generic components in
`legacy/src/lib/components/ui/` and the layout in `legacy/src/lib/components/layout/`. Every
page phase after this one composes those classes and components; porting them once, with
tests, keeps later phases from re-inventing styles.

## Read first

`legacy/tailwind.config.js`, `legacy/src/app.css` (whole file), every file under
`legacy/src/lib/components/ui/`, `legacy/src/lib/components/layout/`,
`legacy/src/lib/components/Maintenance.svelte`, `legacy/src/lib/actions/reveal.ts`,
`legacy/src/routes/+layout.svelte`. The Tailwind 4 skill in the agent home explains `@theme`,
`@utility` and `@apply` in v4.

## Deliverables

### 1. Tokens and base styles (`src/app.css`)

- `@theme` block declaring every colour scale (`brand`, `ivory`, `charcoal`, `sage`, `gold`
  with the exact hex values), `--font-sans` / `--font-serif`, the radii (`shell`, `core`,
  `shell-lg`, `core-lg`, `2xl`, `3xl`), letter-spacing (`extra-wide`, `eyebrow`, …), the
  easing custom properties (`--ease-fluid`, `--ease-soft`) and any other extension in the
  legacy config (box-shadow `ambient`/`float`, animations such as `breathe`, max-width
  `reading`). Nothing is renamed: a class that worked in legacy markup must work here.
- Fonts self-hosted: `@fontsource-variable/plus-jakarta-sans` and
  `@fontsource/cormorant-garamond` (weights used by legacy) imported in `app.css`; no Google
  Fonts `<link>` anywhere.
- Base layer ported (body background, grain overlay, headings, selection, focus-visible,
  scrollbar) and **every** component/utility class defined in `legacy/src/app.css`
  re-created (as `@utility` or `@layer components` with `@apply`, whichever Tailwind 4 needs
  for that class). Produce the list with
  `grep -oE '^\s*\.[a-zA-Z0-9_-]+' legacy/src/app.css | sort -u` and keep it in a comment at
  the top of the ported section so the reviewer can diff it.

### 2. UI kit (`src/lib/components/ui/`)

Port `Alert`, `Avatar`, `Badge`, `Button`, `Card`, `Input`, `Modal`, `OptimizedImage`,
`Select`, `Spinner`, `Textarea`, `Toggle` and the barrel `index.ts`, plus
`src/lib/actions/reveal.ts`. Rules: Svelte 5 runes, `interface Props`, `{#snippet}` children,
`$bindable()` for form values as legacy does, `#lib` imports, `asset()` from `$app/paths` for
static files, `PUBLIC_BUNNY_CDN_URL` from `$app/env/public` in `OptimizedImage` (fallback to
the plain `src` when unset). Fix the two legacy a11y warnings if they are in these files; do
not change visual output.

### 3. Layout shell

`src/lib/components/layout/Header.svelte` (prop `viewer: { name: string | null; avatarUrl: string | null; isAdmin: boolean } | null`
instead of the legacy `User`; nav links as legacy plus a `Catalogue` entry pointing to
`/catalogue`), `Footer.svelte`, `PageHeader.svelte`, `src/lib/components/Maintenance.svelte`,
and `src/routes/+layout.svelte` rendering Header/Footer around `{@render children()}` and
hiding the shell for `/admin` and maintenance exactly as legacy (`page.data.maintenance`).
`src/routes/+layout.server.ts` returns `{ viewer: null, maintenance: false }` for now
(PHASE-05 fills it). `src/routes/+error.svelte` and `src/error.html` ported.

### 4. Styleguide route and SSR tests

- `src/routes/(dev)/styleguide/+page.svelte` + `+page.server.ts` that `error(404)`s unless
  `dev` (from `$app/env`); renders every UI component in its variants and the typographic
  classes. It exists so a human can eyeball the port in `npm run dev`.
- `src/lib/components/ui/ui.test.ts` using `render` from `svelte/server`: `Button` renders a
  `<button>` with the primary classes and `disabled` when asked; `Badge` variant classes;
  `Input` renders `label`, `name`, `id` association and an error message; `OptimizedImage`
  builds a `srcset` with the CDN query parameters when a CDN URL is given and a plain `src`
  otherwise; `Header` renders the sign-in link for `viewer = null` and the avatar/initials
  menu for a viewer.

Out of scope: marketing sections (`legacy/src/lib/components/marketing/*`, PHASE-10), course
components (PHASE-11), admin components (PHASE-16), any page content.

## Steps

1. Tokens + base + utilities, commit `feat(design): port tokens and base styles to Tailwind 4`.
2. UI kit + reveal action, commit; `npm run check` after each component batch.
3. Layout shell + root layout + error pages, commit.
4. Styleguide + SSR tests, commit.
5. Gate once at the end.

## Definition of Done

- [ ] Every class selector listed by the grep above exists in `src/app.css` (reviewer runs the grep on both files and diffs); every colour hex from `legacy/tailwind.config.js` appears in `src/app.css`.
- [ ] No request to `fonts.googleapis.com` or `fonts.gstatic.com` anywhere in `src/` or `static/`; both fontsource packages are in `dependencies`.
- [ ] The 12 UI components, `index.ts`, `reveal.ts`, `Header`, `Footer`, `PageHeader`, `Maintenance`, `+layout.svelte`, `+layout.server.ts`, `+error.svelte`, `error.html` exist; `grep -rn '\$lib' src` returns nothing; no file under `src/` imports from `legacy/`.
- [ ] `src/lib/components/ui/ui.test.ts` has the five listed cases and passes.
- [ ] `/styleguide` returns 404 outside dev (code reads `dev` from `$app/env`).
- [ ] `npm run check` 0 errors / 0 warnings, `npm run lint`, `npm run build` (no env), `npm test` all pass.
