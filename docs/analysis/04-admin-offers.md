# 04 — Admin: building offers from one or more videos

Decisions (2026-10-18): the admin composes products from videos; the admin panel browses the Bunny
Stream library **and** uploads new videos directly; sellable units are the whole course, bundles and
standalone videos.

## Admin information architecture

```
Dashboard
Catalogue      products (course · bundles · singles), featured order
Videos         media library: Bunny browser, upload, encoding status
Course         modules & lessons (course content), resources
Promotions     codes, redemptions, bulk generation          → 05-discounts.md
Orders         orders, refunds, fulfilment status
Users          search, entitlements, grants, suspension, admin 2FA
Content        blog, FAQ, testimonials
Inbox          contact submissions, newsletter subscribers
Settings       maintenance, site texts, Bunny/Stripe health
```

Everything under `/admin` requires `is_admin && !is_suspended` and a completed two-factor
challenge, enforced in the hook. Every mutation writes `audit_log`.

## Core objects the admin manipulates

| Object | Admin creates it by | Becomes sellable when |
|---|---|---|
| **Media asset** | uploading in the admin (TUS to Bunny) or importing an existing Bunny video | never directly; it is attached to a lesson |
| **Lesson** | “New lesson” inside a module (course content) or “New standalone video” (no module) | included in a product |
| **Product · single** | “Sell this video” on a standalone lesson, or Catalogue → New product → Single | published with a price |
| **Product · bundle** | Catalogue → New product → Bundle, then pick 2+ lessons | published with a price and ≥ 2 items |
| **Product · course** | exists once (`access_scope = 'all'`); editable price, copy, cover | always |

The course product has no item list: it grants every lesson, present and future (the
grandfathering decision). Bundles and singles list their lessons explicitly in `product_items`.

## Product editor

A single page with sections, saved as one form (superforms + valibot), autosaving drafts is not
needed:

1. **Basics** — kind (locked after creation), title, slug (auto from title, editable), tagline,
   description (Markdown with live preview), cover image (upload to Bunny Storage through the
   server; the CDN URL with Optimizer params is stored).
2. **Contents** (bundle / single) — item picker: search box over lessons (title, module, duration,
   standalone/course badge, “already in: Zippers Pack” hint), add/remove, drag to order, running
   total of videos and minutes. A single accepts exactly one item. Validation refuses an empty
   bundle and a bundle that duplicates another published bundle's exact set (warning, not error).
3. **Pricing** — list price (GBP, pence stored, pounds shown), optional sale price with start/end,
   live preview of what the catalogue card will show; floor 30p; a bundle priced above the sum of
   its singles triggers a warning.
4. **Visibility** — published toggle with a checklist (cover, description, price, items, every
   included lesson published and its media `ready`), featured flag, sort order.
5. **Where it is sold / what it unlocks** — read-only panels: active promotions scoped to this
   product; for a lesson, the list of products that include it.

Publishing a product calls the ISR revalidation for `/catalogue` and `/products/[slug]`.

## Videos: Bunny Stream integration

### Library browser

`GET https://video.bunnycdn.com/library/{libraryId}/videos?page=1&itemsPerPage=50&search=…&orderBy=date`
with the `AccessKey` header, server-side only. Results are shown with thumbnail, title, length,
status and a “linked to lesson X” badge when a `media_assets` row exists. **Import** creates the
`media_assets` row; a periodic **Sync** (cron, hourly) refreshes duration/status/thumbnail for
known assets and surfaces videos deleted in Bunny.

### Upload from the admin (TUS, resumable)

1. Admin picks a file; the browser asks the server for an upload ticket.
2. Server: `POST /library/{libraryId}/videos` with `{ title }` → `guid`; inserts
   `media_assets (status = 'uploading')`; computes the presigned TUS headers:
   `AuthorizationSignature = sha256_hex(libraryId + apiKey + expirationTime + guid)`,
   `AuthorizationExpire = expirationTime` (unix seconds, ~2 h), `VideoId = guid`,
   `LibraryId = libraryId`. The API key never leaves the server.
3. Browser uploads directly to `https://video.bunnycdn.com/tusupload` with `tus-js-client`
   (chunked, resumable; progress bar; resume after a dropped connection; metadata `filetype`,
   `title`).
4. On completion the asset shows **Processing**. Bunny posts to `/api/webhooks/bunny`
   (`{ VideoLibraryId, VideoGuid, Status }`; 3 = encoding, 4 = finished, 5 = failed). The webhook
   is treated as a hint: the handler re-fetches `GET /library/{id}/videos/{guid}` and stores
   `length`, `width`, `height`, `thumbnailFileName`, `status`; deliveries are deduplicated in
   `webhook_events`. A cron fallback polls assets stuck in `processing` for more than 30 minutes.
5. **Ready** assets can be attached to a lesson; thumbnail can be changed
   (`POST /videos/{guid}/thumbnail?thumbnailTime=…` or a custom image); captions can be uploaded
   (`POST /videos/{guid}/captions/{lang}`) for accessibility.

Deleting: unlinking an asset from a lesson is always allowed; deleting the Bunny video requires a
typed confirmation and is refused while a published lesson references it.

### Library security settings (one-time, in the Bunny dashboard)

Embed view token authentication **on** (key in `BUNNY_EMBED_TOKEN_KEY`); allowed referrers = the
production and beta hostnames; block direct URL file access; MP4 fallback off (prevents trivial
downloads); CORS hostnames restricted. The player embed itself is unchanged
(`iframe.mediadelivery.net/embed/{lib}/{video}?token&expires`).

## Lesson editor

Fields: title, slug, kind (video / article), **media asset** (drawer: search the library, pick, or
upload inline), description, content (Markdown + preview; rendered and sanitised on save),
resources (PDF/pattern uploads to Bunny Storage; served through `/download/[id]` which checks the
entitlement and redirects to a short-lived signed URL), module (or “standalone video”), order
within module, free preview, published. Duration comes from the asset; the hand-typed
`duration_minutes` disappears. Changing the module of a lesson that is inside a bundle is allowed
(bundles reference lessons, not modules).

“Sell this video” on a standalone lesson opens the product editor pre-filled as a single.

## Orders

List with status filter, search by email / order id / Stripe id; detail shows items with prices and
discounts, promo code, Stripe links (session, payment intent, charge), fulfilment status per item
(entitlement granted / revoked), timeline (created, paid, refunded). Actions: **Re-run
fulfilment** (idempotent, for the rare webhook gap), **Resend receipt**, **Add note**. Refunds are
issued in the Stripe dashboard at first; the webhook mirrors them and revokes access. A one-click
refund button (`refunds.create`) is a later addition once the flow is trusted.

## Users

Search by email or name; profile shows orders, entitlements (product, source, granted/revoked,
by whom), progress summary, sessions (revoke all). Actions: **Grant product** (complimentary, with
reason → `source = 'admin_grant'`), **Revoke**, **Suspend / unsuspend** (existing semantics),
**Send password reset**, **Make admin / remove admin** (requires the acting admin's fresh 2FA),
**Anonymise & delete** (GDPR; keeps order rows with the user id, blanks personal fields).

## Dashboard

Revenue and orders for the last 30 days by product kind; new buyers; top five products; active
promotions with redemption counts; videos processing/failed; unread contact submissions. All from
indexed queries on `orders`, `order_items`, `entitlements`; no cached stats table is needed at this
volume.

## Implementation notes

- Forms: one schema per form in `lib/shared/schemas/admin/*.ts`, reused by the client for inline
  errors and by the action for the real decision.
- Item picker: `GET /admin/api/lessons?q=` returns 20 matches (title, module, duration, products);
  the picker component holds the ordered list in `$state` and submits ids as a hidden JSON field
  validated server-side (every id must exist, be a lesson, and be unique).
- Uploads: `tus-js-client`, chunk size 5 MB, `retryDelays [0, 3000, 10000]`; the ticket endpoint is
  rate-limited and admin-only; expired tickets can be re-issued for the same `guid` to resume.
- Every admin service function takes `actor` and writes `audit_log` in the same transaction.
- Optimistic concurrency on product and lesson edits: the form carries `updated_at`; a mismatch
  returns “someone else saved this; reload” rather than overwriting.
- Preview as member: a read-only “view as” mode that evaluates access for a chosen user without
  signing in as them (sets `locals.viewAs`, logged), useful to verify what a bundle unlocks.
