# PHASE-17 — Admin: course content, lesson editor with Markdown, media library, Bunny upload (TUS), Bunny webhook

## Why

The admin manages videos without leaving the panel (owner decision): browse the Bunny library,
upload with resumable TUS, see encoding status, attach assets to lessons; edit lessons and
articles in Markdown with a preview.

## Read first

`docs/analysis/04-admin-offers.md` → “Videos: Bunny Stream integration”, “Lesson editor”,
“Implementation notes”; `legacy/src/routes/admin/modules/**`, `legacy/src/routes/admin/lessons/**`
(fields and validation to keep); `src/lib/server/modules/{media,content}` (PHASE-07),
`src/lib/server/platform/bunny.ts`, PHASE-16 form helpers.

## Deliverables

### 1. Routes — content

- `/admin/content/modules` (list with lesson counts, reorder via up/down actions),
  `/admin/content/modules/new`, `/admin/content/modules/[id]` (edit, delete with the
  `MODULE_HAS_SOLD_LESSONS` message, lesson list with publish state).
- `/admin/content/lessons` (filter: module / standalone / unpublished / media not ready),
  `/admin/content/lessons/new`, `/admin/content/lessons/[id]`: fields from PHASE-07 schema;
  module select with “Standalone video” option; **media picker** (`MediaPicker.svelte`: drawer
  listing `media.list` with search and status, “Import from Bunny” and “Upload” entry points,
  selected asset preview: thumbnail, duration); Markdown editor (`MarkdownEditor.svelte`:
  textarea + preview pane calling `POST /admin/api/markdown-preview` which returns
  `renderMarkdown(body)`), resources add/remove (title + https URL), free preview and publish
  toggles; publish refusal shows the `MEDIA_NOT_READY` / `LESSON_IN_PRODUCT` messages; “Sell this
  video” link to `/admin/catalogue/new?kind=single&lesson=<id>` for standalone lessons (the
  route arrives in PHASE-18; link anyway).

### 2. Routes — media

- `/admin/media`: table of assets (thumbnail, title, duration, status, linked lesson), search,
  “Sync now” action (`media.syncProcessing({ olderThanMinutes: 0 })`), “Import from Bunny”
  modal (`/admin/media/import`: paged `media.importFromLibrary` with search; import button per
  row), detail `/admin/media/[id]` (set thumbnail time, delete with refusal message, link to
  the lesson).
- `/admin/media/upload`: `UploadForm.svelte` with `tus-js-client` (runtime dependency named
  here): file + title → `POST /admin/api/upload-ticket` (admin-only, returns
  `{ assetId, endpoint, headers, metadata }` from `media.createUpload`) → TUS upload to
  `https://video.bunnycdn.com/tusupload` with the presigned headers, chunk size 5 MB,
  `retryDelays: [0, 3000, 10000]`, progress bar, pause/resume, “Resume” after reload using
  `POST /admin/api/upload-ticket/reissue` (`media.reissueTicket`); on success, poll
  `GET /admin/api/media/[id]` every 5 s until `ready` or `failed`, then link to the asset.
- `src/routes/api/webhooks/bunny/+server.ts`: POST JSON `{ VideoLibraryId, VideoGuid, Status }`;
  reject when `VideoLibraryId` is not ours (400); insert `webhook_events (provider 'bunny',
  event_id = \`${VideoGuid}:${Status}\`)` (duplicates are logged but still synced: the
  handler is idempotent because it re-fetches from the API); `media.handleWebhook`; 200.

### 3. Tests

`tests/routes/admin-lessons.test.ts` (create standalone lesson; slug collision error surfaces
on the field; publish with non-ready media → form error `MEDIA_NOT_READY` text; markdown
preview endpoint sanitises `<script>` and is admin-only); `tests/routes/admin-media.test.ts`
(upload ticket endpoint: 403 non-admin, creates an `uploading` asset and returns the fake
host's ticket headers; reissue; media status endpoint); `tests/routes/bunny-webhook.test.ts`
(wrong library → 400; valid → asset synced from the fake host's state, not from the payload
status; repeated delivery still 200). SSR test for `MediaPicker` (renders status badges) and
`MarkdownEditor` (renders the textarea and preview region).

Out of scope: catalogue/products (PHASE-18), resource file uploads (PHASE-20: URLs only here).

## Steps

1. Content routes + components + tests, commit (two commits: modules, lessons).
2. Media routes + upload + ticket endpoints + tests, commit.
3. Bunny webhook + test, commit.
4. Gate once.

## Definition of Done

- [ ] The Bunny API key never reaches the browser: the only consumer of `BUNNY_VIDEO_API_KEY` is the runtime env → video host adapter; the upload ticket endpoint returns presigned headers only (reviewer reads it).
- [ ] `tus-js-client` is the only dependency added; the client uses the endpoint and headers from the ticket (reviewer reads `UploadForm.svelte`).
- [ ] The Bunny webhook ignores the payload status and syncs from the host (test); wrong library → 400.
- [ ] Lesson publish refusal and slug collision are shown as form errors (tests); the preview endpoint is admin-only and sanitised (test).
- [ ] All listed routes exist; every action goes through `adminForm` and a service call.
- [ ] Gate green.
