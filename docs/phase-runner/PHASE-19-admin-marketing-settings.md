# PHASE-19 — Admin: blog, FAQ, testimonials, inbox (contacts, subscribers), settings

## Why

The remaining legacy admin screens, rebuilt on the marketing service (PHASE-09) with Markdown
editing, proper CSV export and the maintenance switch.

## Read first

`legacy/src/routes/admin/{blog,faq,testimonials,contacts,subscribers,settings}/**`;
`src/lib/server/modules/marketing/`; PHASE-16/17 components (`Form`, `DataTable`,
`MarkdownEditor`, `ConfirmForm`).

## Deliverables

### 1. Routes

- `/admin/content/blog`, `/new`, `/[id]`: title, slug, excerpt, featured image https URL,
  content Markdown (preview), publish toggle (`published_at` set once), delete with
  `ConfirmForm`. Legacy posts whose `content_md` is null show their stored HTML read-only with
  a “convert to Markdown” note (no automatic conversion).
- `/admin/content/faq`, `/new`, `/[id]`: question, answer Markdown, category, order,
  published; reorder actions.
- `/admin/content/testimonials`, `/new`, `/[id]`: moderation list (pending first), publish /
  feature / order / edit / delete; member-submitted ones show the member.
- `/admin/inbox/contacts`: list, mark read, reply-to mailto; `/admin/inbox/subscribers`: list
  with confirmed/unconfirmed/unsubscribed filters, CSV export served by
  `GET /admin/inbox/subscribers/export.csv` (`Content-Disposition: attachment`, quoting from the
  service).
- `/admin/settings`: maintenance toggle (ConfirmForm when turning on), homepage free-preview
  lesson select (`site_settings.home_preview_lesson_id`; `content.freePreviewLesson()` honours
  it when set and published, else falls back to the first flagged lesson), contact email shown
  read-only from config.

### 2. Tests

`tests/routes/admin-blog.test.ts` (publish sets `published_at` once; Markdown saved renders
sanitised `content_html`; legacy HTML post is not rewritten on save of other fields);
`tests/routes/admin-faq.test.ts` (answer sanitised; reorder); `tests/routes/admin-testimonials.test.ts`
(publish and feature flags; member-submitted row shows user id);
`tests/routes/admin-subscribers.test.ts` (export is `text/csv`, attachment, quoted cells);
`tests/routes/admin-settings.test.ts` (toggle writes audit; hook sees the new value after
cache invalidation; preview lesson setting changes `freePreviewLesson()`).

Out of scope: image uploads (PHASE-20).

## Steps

1. Blog + FAQ routes + tests, commit.
2. Testimonials + inbox + tests, commit.
3. Settings + content service tweak + tests, commit.
4. Gate once.

## Definition of Done

- [ ] All listed routes exist; every action uses `adminForm` and a marketing/content service call; every mutation writes `audit_log` (reviewer samples three).
- [ ] `published_at` is set exactly once across publish → unpublish → publish (test).
- [ ] Legacy HTML blog content is never overwritten by a Markdown save unless `content_md` is provided (test).
- [ ] CSV export headers and quoting verified (test).
- [ ] Maintenance toggle takes effect in the hook within the cache window or after invalidation (test).
- [ ] Gate green.
