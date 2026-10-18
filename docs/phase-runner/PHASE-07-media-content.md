# PHASE-07 — Media and content services: Bunny-backed assets, modules, lessons, Markdown, progress

## Why

Videos stop being strings. A `media_assets` row (PHASE-04) represents a Bunny Stream video with
its status, duration and thumbnail; a lesson points at one. Standalone videos are lessons without
a module. Lesson and article bodies are Markdown rendered through a sanitiser at save time
(`02-security-audit.md` M1). This phase delivers the services every content page and the admin
content screens use; it has no routes.

## Read first

`docs/analysis/04-admin-offers.md` → “Videos: Bunny Stream integration”, “Lesson editor”;
`docs/analysis/03-architecture.md` → Data model (media_assets, modules, lessons);
`legacy/src/routes/admin/lessons/**/+page.server.ts`, `legacy/src/routes/admin/modules/**/+page.server.ts`
(validation rules to keep), `legacy/src/routes/api/progress/+server.ts`,
`legacy/src/lib/server/validation.ts`, `legacy/src/lib/data/course-overview.ts`;
`src/lib/server/platform/bunny.ts` (PHASE-06).

## Deliverables

### 1. `src/lib/server/modules/content/markdown.ts`

`renderMarkdown(md: string): string` = `marked` (GFM, no raw HTML passthrough of dangerous
tags) → `sanitize-html` with an explicit allow-list: `p h2 h3 h4 ul ol li strong em a img
blockquote code pre hr br table thead tbody tr th td figure figcaption`; attributes `a[href,
title, rel, target]` (schemes `http https mailto`; `rel="noopener noreferrer"` forced on
`target=_blank`), `img[src, alt, width, height]` (scheme `https` only). Everything else,
including `on*` handlers, `style`, `script`, `iframe`, is dropped. Export the allow-list so the
test can assert against it.

### 2. `src/lib/server/modules/media/`

`createMediaService({ db, videoHost, log })`:
- `importFromLibrary({ page, perPage, search })` → calls `videoHost.listVideos`, upserts
  `media_assets` by `(library_id, video_id)`, returns rows plus `linkedLessonId`.
- `syncAsset(videoId)` → `videoHost.getVideo` → updates status/duration/dimensions/thumbnail.
- `syncProcessing({ olderThanMinutes })` → `syncAsset` for every `uploading|processing` asset
  older than the threshold (cron entry point).
- `createUpload({ title })` → `videoHost.createVideo` → `media_assets (status 'uploading')` →
  `videoHost.uploadTicket(videoId, 7200)`; returns `{ asset, ticket }`.
- `reissueTicket(assetId)` for resumes; `handleWebhook({ videoGuid })` → `syncAsset` (payload
  status is ignored by design; comment says why).
- `list({ status?, search? })`, `get(id)`, `remove(id)` (refuses when any lesson references
  it: error `MEDIA_IN_USE`), `setThumbnail(id, seconds)`.

### 3. `src/lib/server/modules/content/`

`createContentService({ db, log })` exposing namespaces:
- `modules`: `list({ publishedOnly })`, `getBySlug`, `create`, `update`, `reorder(ids)`,
  `remove(id)` (refuses when a lesson of the module is referenced by `product_items`:
  `MODULE_HAS_SOLD_LESSONS`).
- `lessons`: `create(input)` / `update(id, input)` where `input` has `moduleId | null`,
  `title`, `slug`, `kind`, `mediaAssetId | null`, `description`, `contentMd`, `isFreePreview`,
  `isPublished`, `orderIndex`; `content_html` is always recomputed from `content_md`; slug
  uniqueness per module, globally for standalone; `publish(id)` refuses a video lesson whose
  asset is not `ready` (`MEDIA_NOT_READY`) and a lesson of a module that is unpublished only
  when… no: publishing a lesson never depends on module state (legacy behaviour); `remove(id)`
  refuses when `product_items` references it (`LESSON_IN_PRODUCT`); `getBySlugs(moduleSlug,
  lessonSlug)`, `getStandaloneBySlug(slug)`, `listStandalone({ publishedOnly })`,
  `listByModule(moduleId)`, `durationSeconds(lesson)` from the asset.
- `outline()` → published modules with published lessons, each with `durationSeconds`,
  `isFreePreview`, `mediaAssetId`, plus totals `{ modules, bonusModules, videos, minutes }`
  (replaces `legacy/src/lib/data/course-overview.ts`).
- `resources`: `listForLesson`, `add`, `remove`.
- `progress`: `upsert({ userId, lessonId, completed?, positionSeconds? })` refusing
  unpublished lessons (`LESSON_NOT_FOUND`), positions outside `0..86400`; `forUser(userId)`;
  `summary(userId)` → `{ totalLessons, completedLessons, minutesWatched, perModule[] }`,
  `continueWatching(userId, limit)`, `recentlyCompleted(userId, limit)`.
- `freePreviewLesson()` → the first published lesson with `is_free_preview = true` ordered by
  module/lesson order (the homepage preview; replaces the hard-coded video id).

Service errors are thrown as `DomainError(code, message)` from `src/lib/server/modules/errors.ts`
(new, shared by all modules); routes map codes to `fail()`.

### 4. Validation schemas (`src/lib/shared/schemas/content.ts`)

valibot schemas for module and lesson input (slug `^[a-z0-9-]+$`, title 1–200, description ≤ 2000,
`contentMd` ≤ 50 000, order index integer ≥ 0, uuid ids) reused by admin forms later.

### 5. Wiring

`Services` gains `media` and `content`; container builds them with the real video host.
`tests/helpers/services.ts`: `createTestServices(db, overrides?)` building every service so far
with fakes (video host, mailer, logger, limiter) — later phases extend it.

### 6. Tests (PGlite + fakes)

`markdown.test.ts` (headings/lists/links survive; `<script>`, `onclick`, `javascript:` href,
`style`, `iframe` removed; `target=_blank` gets `rel`); `media/service.test.ts` (import
upserts and links; createUpload creates asset+ticket; handleWebhook syncs from the host not the
payload; remove refuses when referenced); `content/service.test.ts` (slug rules per module and
standalone; `content_html` recomputed and sanitised; publish refuses non-ready media; remove
refuses sold lesson; `outline()` totals; progress upsert validation and summary; `freePreviewLesson`).

Out of scope: routes, admin UI, Bunny webhook endpoint (PHASE-17), catalog/products.

## Steps

1. `errors.ts`, `markdown.ts` + test, commit.
2. Media service + test, commit.
3. Content service + schemas + test, commit.
4. Wiring + `tests/helpers/services.ts`, gate once.

## Definition of Done

- [ ] `markdown.test.ts` proves the six removals and the `rel` enforcement; the allow-list is exported and the test asserts `script`/`iframe`/`style` are absent from it.
- [ ] `media/service.test.ts` and `content/service.test.ts` contain every listed case and pass; no network (`videoHost` is the fake).
- [ ] `content_html` is written only by `renderMarkdown` (grep: the only writer of `content_html` is the content service, and it calls `renderMarkdown`).
- [ ] `lessons.remove`, `modules.remove`, `media.remove` refuse when referenced (tests prove the three codes).
- [ ] `outline()` totals are computed from the database (no file under `src/lib/data/` holds course statistics).
- [ ] `Services` exposes `media` and `content`; `tests/helpers/services.ts` exists and is used by the tests.
- [ ] Gate green.
