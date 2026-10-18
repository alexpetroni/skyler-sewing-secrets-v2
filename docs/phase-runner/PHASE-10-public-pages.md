# PHASE-10 — Public pages: home, about, FAQ, blog, testimonials, fabric library, legal, contact

## Why

The marketing site is kept as it is, re-implemented on the new services. Home statistics come
from the database (`content.outline()`), the free preview comes from the flagged lesson, and the
offer block shows the flagship product from the catalogue instead of `pricing_config`.

## Read first

Every file under `legacy/src/routes/` for `+page.svelte` of `/`, `about`, `faq`, `blog`,
`blog/[slug]`, `testimonials`, `fabric-library`, `contact`, `legal/*`, and
`legacy/src/routes/+page.server.ts`; every component under `legacy/src/lib/components/marketing/`;
`legacy/src/lib/data/fabric-library`-related data (`legacy/seed/fabric-library.json`,
`legacy/src/lib/data/social-links.ts`); the vendored images under `static/` at the repository
root (there is no `legacy/static/`; the legacy `static/` tree was copied there as-is).

## Deliverables

### 1. Marketing components (`src/lib/components/marketing/`)

Port `Hero` (carousel with images/video thumbnails, rotate property), `Features`,
`FreePreview` (takes `embedUrl` and lesson title), `Instructor`, `ModulesPreview` (takes
`outline` from the content service; computes nothing from static data), `Offer` (renamed from
`Pricing`: takes the flagship product with `effectivePrice`; links to `/products/[slug]` and
shows the “what's included” list derived from `outline.totals`), `Testimonials`, `Cta`,
`index.ts`. Keep classes, copy and structure.

### 2. Routes (`src/routes/(marketing)/`)

- `/` — load: `outline`, `featured testimonials (6)`, `flagship`, `freePreviewLesson` →
  `videoHost.embedUrl` (null when none); maintenance handled as legacy (`locals.maintenanceMode`
  → render `Maintenance`); page composes the sections in legacy order.
- `/about`, `/fabric-library` (data moved to `src/lib/data/fabric-library.ts` typed), `/legal/terms-and-conditions`,
  `/legal/privacy` (add the processors list from `06-new-approaches.md` → Compliance),
  `/legal/claims` — static pages ported verbatim.
- `/faq` (grouped by category, `answer_html ?? answer`), `/blog` (list), `/blog/[slug]`
  (`content_html ?? content`, 404 when unpublished), `/testimonials` (all published).
- `/contact` page wrapping the PHASE-09 action with the legacy layout and the honeypot field
  (visually hidden, `autocomplete="off"`, `tabindex="-1"`), plus Turnstile widget markup when
  `PUBLIC_TURNSTILE_SITE_KEY` is present — add `PUBLIC_TURNSTILE_SITE_KEY` (public, optional)
  to `src/env.ts` and `.env.example`; remove the private `TURNSTILE_SITE_KEY` if PHASE-01
  declared it privately.
- `src/lib/components/Seo.svelte` (title, description, canonical, og tags; default image from
  legacy) used by every page; `src/routes/sitemap.xml/+server.ts` (static pages + published
  blog posts + published products once PHASE-13 exists: read what the catalog service exposes
  now) and `static/robots.txt` kept.
- Root layout: Header receives `viewer` and the nav from PHASE-02; a `/catalogue` link is
  present (the route itself arrives in PHASE-13; link to it anyway).

### 3. Tests

`tests/routes/home.test.ts` (load returns outline totals computed from seeded lessons, the
flagship with price, an embed URL for the free-preview lesson, and `maintenance` data when the
flag is on); `tests/routes/blog.test.ts` (unpublished slug → 404; published → html body);
`tests/routes/faq.test.ts` (grouping by category, order); SSR render tests
(`marketing/marketing.test.ts`) for `Offer` (renders the formatted price and the product link)
and `ModulesPreview` (renders one card per module with the video count).

Out of scope: catalogue/product pages (PHASE-13), member pages (PHASE-11), admin, ISR
(deliberately not used: the layout is personalised; see analysis).

## Steps

1. Components, commit.
2. Routes group by group, `npm run check` between, commit each group.
3. Seo + sitemap + env tweak, commit.
4. Tests, gate once.

## Definition of Done

- [ ] All listed routes exist under `src/routes/(marketing)/`; `npm run build` renders them (no build-time data fetching).
- [ ] No file under `src/lib/data/` contains course statistics; `ModulesPreview`/`Offer` take data from the services (reviewer reads the components and `/+page.server.ts`).
- [ ] The homepage free preview comes from `content.freePreviewLesson()` (no hard-coded `bunny:` id in `src/`: `grep -rn "bunny:" src --include=*.ts --include=*.svelte` returns only the parser/tests).
- [ ] `Seo.svelte` is used by every marketing page; `sitemap.xml` lists the static routes and published blog slugs (test or build output).
- [ ] `/contact` includes the honeypot and conditional Turnstile markup; `PUBLIC_TURNSTILE_SITE_KEY` declared public and optional.
- [ ] The listed tests exist and pass.
- [ ] Gate green.
