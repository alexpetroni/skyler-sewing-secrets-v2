# 06 — Suggested new approaches

Ranked inside each group by value for effort. Items marked **launch** belong in v2's first release;
**later** are backlog candidates for the owner to prioritise.

## Conversion and product

- **Locked-lesson upsell (launch).** A locked lesson shows the cheapest product that unlocks it
  and the course price next to it (“This video £9 · Full course £149”). Today a non-member is
  redirected to checkout with no context.
- **Catalogue with real previews (launch).** Each standalone video and bundle gets a trailer
  (a separate, short Bunny asset flagged `is_free_preview`) rather than exposing the paid asset.
- **Course as the anchor (launch).** When the cart total passes ~60% of the course price, suggest
  the course; when a buyer owns several singles, show “you have paid £X toward the course” as
  messaging only (no credit, per the decision), which still nudges the upgrade.
- **Sale prices without codes (launch).** `products.sale_price` with a window; the catalogue shows
  the struck-through price. Cheaper to run than codes for seasonal promotions.
- **Abandoned-checkout email (later).** The account exists before Stripe, so an unpaid order older
  than 2 hours can trigger one reminder with the cart restored by link.
- **Gift purchases (later).** `entitlements.source = 'gift'` is already in the model; UI = buyer
  enters recipient email at checkout, recipient claims via link.
- **Completion certificate (later).** PDF per module/course on 100% progress; cheap engagement.

## Member experience

- **Resume playback (launch).** The Bunny player exposes player.js events through the iframe;
  send `last_position_seconds` every 15 s and on `pause`; the lesson page starts the embed at
  `?t=` the stored position. The column exists and is unused today.
- **My library (launch).** One page listing everything owned (course modules, bundles, singles)
  with progress, replacing the course-only dashboard.
- **Search (later).** Postgres full-text (`tsvector` over title, description, transcript) across
  lessons and blog; no external service needed.
- **Captions and transcripts (later).** Bunny can generate captions; store transcripts for search
  and SEO on public preview pages.

## Content protection

- **Signed embeds mandatory, referrer allow-list, MP4 fallback off (launch).** See the audit (H2).
- **Resource downloads behind entitlement checks with short-lived signed URLs (launch).**
- **Session hygiene (launch).** Revoke sessions on password reset; cap concurrent sessions per user
  at, say, five, with a “sign out everywhere” button in the profile.
- **Per-user video access rate limit (later).** More than N distinct lesson embeds per minute from
  one account is a sharing signal; log and alert, do not block automatically.

## Commerce and payments

- **Let Stripe choose payment methods (launch).** Drop `payment_method_types: ['card']`; enable
  Apple Pay, Google Pay, Link and PayPal in the Stripe dashboard.
- **Receipts and invoices (launch).** `customer_creation: 'always'` and `invoice_creation` on the
  Checkout Session so buyers get a proper invoice; store `stripe_customer_id` (column exists).
- **Refund and dispute handling (launch).** Webhook events revoke access and update the order;
  the admin sees the state. Today nothing happens.
- **Stripe Tax (owner decision).** Digital services sold to EU consumers are taxed where the buyer
  lives; `automatic_tax: { enabled: true }` plus a Stripe Tax registration handles it. Flag to the
  owner with their accountant; no schema impact.
- **Multi-currency (later).** Stripe Adaptive Pricing or `currency_options` on synced Prices; add a
  `product_prices` table now if this is likely within a year.

## Operations and quality

- **Neon branch per preview deployment (launch).** The Vercel–Neon integration creates a database
  branch for every preview; E2E tests run against real schema with disposable data.
- **Error tracking (launch).** Sentry for server and client; `handleError` already produces an
  error id, surface it in Sentry and on the error page.
- **Audit log (launch).** Every admin mutation and every grant/revoke; answers “who changed the
  price” and “why does this user have access”.
- **Webhook idempotency store (launch).** `webhook_events` keyed by provider event id.
- **Scheduled jobs (launch).** Vercel Cron for order expiry, Bunny status sync, stale-cart cleanup.
- **Playwright on previews (launch).** The flows that make money: buy a single with a code, buy the
  course, refund revokes access, admin creates a bundle.
- **Structured logs with request ids, no personal data (launch).**
- **Uptime and status (later).** External ping on `/api/health` extended to check the database.

## Compliance and trust

- **Account deletion / data export (launch).** Required under UK GDPR; anonymise the user, keep
  order rows for accounting.
- **Newsletter double opt-in (launch).** Removes the email-bomb vector and improves deliverability.
- **Privacy page refresh (launch).** Mention Neon (EU region), Stripe, Bunny, Resend, Vercel as
  processors; the current text predates the move.
- **Cookie notice.** Only essential cookies are used (session, cart, promo); no banner needed if it
  stays that way. Say so on the privacy page.

## Admin productivity

- **Upload from the admin with TUS (chosen, launch).** See `04-admin-offers.md`.
- **Markdown everywhere with preview (launch).** Blog, FAQ, lesson articles, product descriptions.
- **Scheduled publishing (later).** `publish_at` on products and blog posts; the cron flips them.
- **Bulk operations (later).** CSV import of lessons/videos, bulk price update, bulk promo codes.
- **Drafts from transcripts (later).** Generate first-draft descriptions and chapter markers from
  Bunny transcripts with an LLM step the admin reviews; keeps the owner's voice by editing, not
  authoring.

## Architecture options deliberately not taken

- **Stripe as the catalogue source of truth** (Products/Prices/Coupons in Stripe, our DB as a
  mirror): fewer tables but admin would need two systems and promo scoping would depend on Stripe
  coupon semantics. Revisit if multi-currency becomes a requirement.
- **Remote functions** for admin interactivity: attractive, still experimental in SvelteKit 3.x;
  form actions cover every flow today. Adopt when stable.
- **Edge runtime**: removed from `adapter-vercel` in SK3 and unnecessary with a single-region
  database.
- **A headless CMS**: the content volume (40 lessons, 7 blog posts) does not justify another
  system; Markdown in Postgres with an admin editor is enough.
