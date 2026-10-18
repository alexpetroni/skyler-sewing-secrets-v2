# PHASE-11 — Member area: library, course pages, lesson player, standalone videos, progress

## Why

Members watch what they own. Access is decided by `entitlements` (PHASE-08), not a flag; a
locked lesson shows what unlocks it instead of bouncing to checkout. The library replaces the
course-only dashboard and lists everything owned.

## Read first

`legacy/src/routes/dashboard/`, `legacy/src/routes/modules/**` (loads and pages),
`legacy/src/routes/profile/`, `legacy/src/routes/api/progress/+server.ts`,
`legacy/src/lib/components/course/*`; `docs/analysis/03-architecture.md` → Access resolution;
`docs/analysis/06-new-approaches.md` → “Locked-lesson upsell”, “Resume playback”, “My library”;
`src/lib/server/modules/{content,catalog,entitlements}` (PHASE-07/08) and `tests/helpers/fixtures.ts`.

## Deliverables

### 1. Course components (`src/lib/components/course/`)

Port `VideoPlayer` (takes `embedUrl`, `startAt?` seconds appended as `&t=`), `LessonSidebar`
(lock state per lesson from `lockState`), `ProgressBar`, `LessonResources` (links to
`/download/[id]`), plus new `LockedLesson.svelte` (title, description, the cheapest product
that unlocks it and the flagship with prices, links to `/products/[slug]`, a sign-in link for
anonymous visitors) and `ProgressHeartbeat.svelte` (client-side: listens to the Bunny player
`player.js`-style `postMessage` events when available, otherwise a 15-second timer while the
tab is visible, and posts `{ lessonId, positionSeconds }` to `/api/progress`; stops on
unmount).

### 2. Routes

- `/library` (`src/routes/(member)/library/`): `requireActiveMember`; data = owned products
  grouped (flagship → course outline with per-module progress; bundles/singles → their
  lessons with progress), `continueWatching(3)`, `recentlyCompleted(5)`, summary numbers.
  `/dashboard` → 301 to `/library`.
- `/modules`, `/modules/[moduleSlug]`: public outline with per-lesson lock state for the
  viewer (open/locked/suspended) and progress for owners; no redirect for anonymous visitors.
- `/modules/[moduleSlug]/[lessonSlug]` and `/videos/[slug]` (standalone): the lesson page.
  Load: resolve lesson (404 if unpublished or missing), compute `canAccessLesson`; when open →
  `embedUrl` (signed), resources, sibling navigation (module lessons or “more standalone
  videos”), `startAt` from progress; when locked → `locked: true`, `unlockOptions` from
  `cheapestProductForLesson` + flagship, no `embedUrl`, no resources; suspended → `error(403,
  SUSPENDED_MESSAGE)`. Free previews are open to everyone and never expose resources to
  non-owners.
- `/api/progress`: `POST` JSON `{ lessonId, completed?, positionSeconds? }` validated with a
  valibot schema; requires a signed-in, non-suspended user who `canAccessLesson` the lesson
  (free previews count only for owners of something… no: anyone signed in may record progress
  on a free preview); `GET ?lessonId|moduleId` as legacy with UUID validation.
- `/download/[resourceId]`: entitlement check on the resource's lesson → 302 to `file_url`
  (signed storage URLs come in PHASE-20; leave a one-line comment naming that phase).
- `/profile`: name update, “sign out everywhere” (`auth.revokeAllSessions`), list of owned
  products with dates, link to `/leave-review`.

### 3. Tests (`tests/routes/`)

`lesson.test.ts` with `seedCatalog`: anonymous on a paid lesson → `locked: true`, no
`embedUrl`, `unlockOptions` has the single/bundle and the flagship; bundle owner on its lesson →
`embedUrl` set, resources present; bundle owner on a lesson outside the bundle → locked;
all-access member → open on everything incl. a lesson added later; suspended member → 403;
anonymous on a free preview → `embedUrl` set, `resources: []`; unpublished → 404.
`progress-endpoint.test.ts`: 401 anonymous, 403 for a lesson the user cannot access, 400 on a
bad body, upsert on success, GET filters. `library.test.ts`: groups owned products and
redirects anonymous to sign-in. SSR render test for `LockedLesson` (prices and links).

Out of scope: cart buttons on the locked state (PHASE-13 adds them), downloads signing,
reviews UI beyond the link.

## Steps

1. Components, commit.
2. Lesson routes + progress endpoint + tests, commit.
3. Library, modules, profile, download, tests, commit.
4. Gate once.

## Definition of Done

- [ ] Every lesson load decides access with `canAccessLesson` over `accessibleLessonIds` (grep: no `is_member` read in `src/routes/`).
- [ ] A locked lesson returns no `embedUrl` and no resources (test); a free preview returns an `embedUrl` and empty resources for anonymous visitors (test).
- [ ] `lesson.test.ts` has the seven cases, `progress-endpoint.test.ts` the five, `library.test.ts` the two; all pass.
- [ ] `/dashboard` redirects to `/library`; `/library` requires an owner (`requireActiveMember`).
- [ ] `ProgressHeartbeat.svelte` stops its timer on destroy (reviewer reads the `$effect` cleanup) and posts at most every 15 s.
- [ ] Gate green.
