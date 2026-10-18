# DECISIONS.md

## Architecture & Technology

**[2025-01-06] Use dotenv for seed script environment variables** – Installed `dotenv` package and added `import 'dotenv/config'` to `seed/run.ts`. Alternative was Node's built-in `--env-file` flag, but dotenv is more widely compatible and keeps the npm script simple (`npx tsx seed/run.ts`).

**[2025-01-06] Blog posts stored as individual Markdown files with frontmatter** – Moved from a single `blog-posts.json` to individual `.md` files in `seed/blog-posts/`. This makes content easier to edit, diff, and manage in version control. Each file uses YAML frontmatter for metadata (title, slug, excerpt, published_at) and HTML content below.

**[2025-01-06] Seed data organization** – Removed empty placeholder folders (`seed/blog/`, `seed/courses/`, etc.) and kept a flat structure with JSON files for structured data (modules, lessons, testimonials) and a subfolder only for blog posts (which benefit from individual files). Simpler is better until complexity is needed.

## Database & Backend

**[2025-01-04] Supabase for database and auth** – Chose Supabase over alternatives (Firebase, custom PostgreSQL) for built-in auth, Row Level Security, real-time capabilities, and generous free tier. PostgreSQL provides reliability and SQL familiarity.

**[2025-01-04] One-time payment model, not subscriptions** – Business decision: lifetime access for a single payment via Stripe Checkout. Simpler than recurring billing, no churn management, aligns with course-based product model.

**[2025-01-04] Row Level Security for data access control** – RLS policies on all tables rather than application-level checks. Security is enforced at database level, reducing risk of access control bugs in application code.

## Frontend & Styling

**[2025-01-04] SvelteKit with Svelte 5 runes** – Chose Svelte 5's new reactivity model (`$props()`, `$state()`, `$derived()`) over Svelte 4 syntax. Cleaner, more explicit reactivity that scales better. SvelteKit provides SSR, routing, and deployment flexibility.

**[2025-01-04] TailwindCSS for styling** – Utility-first CSS over component libraries (MUI, Chakra) or custom CSS. Faster development, consistent design system, smaller bundle with purging. Added `@tailwindcss/forms` and `@tailwindcss/typography` plugins.

**[2025-01-04] Bunny.net for video hosting** – Chose Bunny.net over Vimeo/Wistia for cost-effectiveness and CDN performance. Videos referenced by `bunny:{libraryId}/{videoId}` format and embedded via iframe.

## Deployment & Infrastructure

**[2025-01-07] Lazy initialization for Stripe client** – Changed `src/lib/server/stripe.ts` from eager initialization (`export const stripe = new Stripe(...)`) to lazy initialization via `getStripe()` function. This fixes Docker build failures where environment variables aren't available at build time. The Stripe client now only initializes when first called at runtime. Added a proxy object for backwards compatibility.

**[2025-01-07] Docker deployment to GHCR and Bunny.net** – Using GitHub Container Registry for image storage and Bunny.net Containers for hosting. Multi-stage Dockerfile keeps production image small. Container listens on port 3000 with health check at `/api/health`.

## Code Organization

**[2025-01-04] Server-only code in `$lib/server/`** – Stripe, Supabase admin client, and email utilities isolated in server-only directory. Prevents accidental client-side imports of sensitive code.

**[2025-01-04] Component structure by purpose** – Split components into `ui/` (generic), `marketing/` (homepage), `course/` (lessons), `layout/` (header/footer), and `auth/` (OAuth). Clear boundaries for reusability and maintenance.

## Type Safety & Patterns

**[2025-01-12] Use `locals.profile` for membership checks, not `locals.user`** – The `locals.user` is the Supabase Auth user (from JWT), which doesn't have `is_member`. The `locals.profile` is fetched from the `profiles` table and contains `is_member`, `is_admin`, `full_name`, etc. Server load functions should use `profile` for authorization checks and return it to pages that need user display data.

**[2025-01-12] Badge semantic variant aliases** – Added `warning`, `secondary`, `success`, `primary`, `error` as aliases mapping to existing color variants (`yellow`, `gray`, `green`, `brand`, `red`). This allows semantic usage in code while maintaining consistent styling. Pattern: extend the Variant type union and add entries to both `variantClasses` and `dotClasses` records.

**[2025-01-12] Form components support `bind:value` via `$bindable()`** – Input, Textarea, and Select components now declare `value = $bindable()` in props, enabling two-way binding. The value is also passed to the underlying element with `bind:value`. This is the Svelte 5 pattern for bindable props.

## Content Management

**[2026-01-12] Move course overview data from seed to src/lib/data** – Moved `course-overview.json` from `seed/` directory to `src/lib/data/course-overview.ts`. The `seed/` directory is for database initialization scripts only, while `src/lib/data/` holds application-level static data and constants. Added proper TypeScript interfaces for type safety. This separates concerns: seed populates database, src/lib/data serves runtime application data.

**[2026-01-12] Course statistics in `seed/course-overview.json`** – Created a single source of truth for course content statistics (videos, minutes, tutorial slides per module). This JSON file can be imported wherever stats are displayed (About page, homepage, modules page) to ensure consistency. Totals: 7 modules (6 + 1 bonus), 32 videos, 273 minutes, 6 tutorial slides.

**[2026-01-12] Standardized contact email to `skyler@skylersewingsecrets.com`** – Consolidated all contact emails across the site (previously had separate privacy@, legal@, hello@ addresses) to a single email. Simpler for the business owner to manage one inbox. Updated in: privacy policy, terms, claims disclaimer, contact page, and email.ts default sender.

**[2026-01-12] About page content separation** – The About page (`/about`) uses only course-focused content from `about-course.txt`. Instructor bio content from `about-me.txt` is used only on the homepage "Meet Your Instructor" section. This keeps the About page focused on selling the course, while the homepage handles personal connection.

## Infrastructure & Media

**[2026-01-13] Bunny.net for image optimization and CDN** – Using Bunny.net Storage with CDN for serving static images with automatic resizing and quality optimization. Images uploaded to storage zone `skyler-storage` and served via CDN at `https://skyler-storage.b-cdn.net`. Created `OptimizedImage` component that generates responsive images with `srcset` and URL parameters (`?width=800&quality=80`). This provides automatic image resizing (400px, 800px, 1200px, 1600px breakpoints) and quality control without local processing. All static images from `/static/images/` uploaded to Bunny Storage (20 files uploaded: fabrics, portraits, logos, favicons, module thumbnails, blog featured images).

**[2026-01-13] Replace all `<img>` tags with OptimizedImage component** – Standardized image loading across the application by replacing all `<img>` tags with the `OptimizedImage` component. This ensures consistent CDN usage, automatic image optimization, and responsive image loading. Component supports width prop for generating appropriate srcset, and maintains all standard HTML img attributes (src, alt, class, loading, etc.). Updated 12 files across layout, auth, admin, and public-facing pages.

## UI/UX

**[2026-01-16] Sticky header for persistent navigation** – Added `sticky top-0 z-50` to the Header component. This keeps navigation visible while scrolling through long pages (lessons, blog posts, modules list). The `z-50` ensures the header stays above other content including modals and dropdowns.

**[2026-01-19] Dedicated testimonials page** – Created a separate `/testimonials` page to showcase all customer reviews. The homepage continues to show featured testimonials, while the dedicated page displays all published testimonials with full details. Added link in footer navigation for easy access.

**[2026-01-19] Country field for testimonials** – Added `country` column to testimonials table to display where students are from (e.g., "UK", "Saudi Arabia"). This shows international reach and adds credibility. Country displays after author_title on testimonial cards. Migration: `005_testimonial_country.sql`.

## Content Strategy

**[2026-01-19] Authentic voice for blog content** – Rewrote all blog posts to use warm, conversational tone with personal anecdotes rather than AI-generated patterns. Removed excessive bullet lists in favor of flowing prose. Content should feel like it's coming from an experienced instructor sharing knowledge, not a template.

**[2026-01-19] Instructor name simplified to "Skyler"** – Changed instructor display from "Gabi Skyler" to just "Skyler" across the site. Simpler, more personal, aligns with brand name "Skyler's Sewing Secrets".

## Developer Experience

**[2026-01-19] Modular seed script architecture** – Restructured seed scripts to allow seeding individual data types. Structure: `seed/lib/` for shared utilities (client.ts, utils.ts), `seed/seeders/` for individual seeders (modules.ts, lessons.ts, testimonials.ts, faq.ts, pricing.ts, blog.ts), and `seed/index.ts` as CLI entry point. npm scripts: `seed:blog`, `seed:testimonials`, etc. This enables quick iteration on specific content without re-seeding everything.

**[2026-01-19] Domain correction to single 's'** – Changed domain from `skylerssewingsecrets.com` (double 's') to `skylersewingsecrets.com` (single 's'). Updated across 7 files: email.ts, contact page, legal pages (privacy, terms, claims), and documentation.

**[2026-01-19] Terminology: "tutorial" instead of "lesson" on /modules page** – Changed user-facing text from "lessons" to "tutorials" for consistency with marketing language. Internal code (variable names, database columns) retains "lesson" terminology.

**[2026-01-19] ModulesPreview stats from database** – Updated homepage ModulesPreview component to calculate video count and duration from the lessons table (same data source as /modules page). Tutorial slides still come from `course-overview.ts` as they're not stored in the database. This ensures stat consistency between homepage and modules page. Format changed to two lines: "X videos, total Y min" and "Z tutorial slides" (when applicable).

**[2026-01-19] Checkout benefits synced with courseOverview** – Updated checkout page to use the same `includedFeatures` list as the homepage Pricing component, both sourced from `course-overview.ts`. This ensures consistency between what users see on the homepage and checkout page. Previously checkout had a hardcoded list with different items.

**[2026-01-19] About page consolidated layout** – Restructured the About page to combine the hero section with the course features. The first section now includes: image on left, text on right with heading, description, CTA buttons, and a compact 4-feature list (video minutes, modules, domestic machine only, bonus project). Removed the separate "Course Features" section to reduce redundancy and improve visual flow.

## Typography & Styling

**[2026-01-20] Typography utility classes for consistent font sizes** – Created reusable CSS utility classes in `app.css` to standardize typography across the site. Classes: `page-title` (text-3xl sm:text-4xl), `section-heading` (text-2xl sm:text-3xl), `subsection-heading` (text-xl), `card-title` (text-lg), `eyebrow` (text-sm font-semibold text-brand-600), `body-lg` (text-lg), `body-base` (text-base), `meta` (text-sm text-charcoal-500). This ensures consistent sizing hierarchy: page titles are always larger than section headings, which are larger than subsections, etc. Previously, font sizes varied inconsistently (some pages used text-4xl for h1, others text-3xl).

**[2026-01-20] Reduced base line-height from 1.7 to 1.5** – The default line-height of 1.7 was too spacious, making text feel disconnected. Changed to 1.5 which is a more standard value that maintains readability while feeling more compact and professional.

**[2026-01-20] Fixed horizontal overflow at 1024px viewport** – The About page image had a fixed width (`w-[37rem]` = 592px) that didn't shrink, causing horizontal scroll on smaller desktops. Changed to responsive sizing (`w-full max-w-lg lg:max-w-xl`). Also added `overflow-x-hidden` to the root layout as a safety net to prevent horizontal scroll site-wide.

## Media & Carousel

**[2026-01-21] Hero carousel expanded with video thumbnail support** – Extended the Hero carousel from 6 to 11 slides, mixing images and video thumbnails. Video slides use an `isVideo` flag to display a play button overlay (white circle with brand-colored play icon). Images processed with sharp for EXIF auto-orientation and landscape rotation. Video thumbnails extracted with ffmpeg. Created reusable scripts: `scripts/process-new-images.ts` (auto-orient, rotate, resize to 1600px) and `scripts/process-video-thumbs.ts` (resize video frames). All carousel images stored in `static/images/collage/` and uploaded to Bunny.net CDN.

## Payment & Authentication

**[2026-01-24] Account creation on success page, not webhook** – Moved new user account creation from the Stripe webhook to the checkout success page. Webhooks are server-to-server requests from Stripe and cannot access browser cookies. The checkout flow stores pending signup data in a cookie, which is only accessible from the success page. Flow: checkout stores pending data in cookie → Stripe payment → success page reads cookie → creates account → signs user in → clears cookie.

**[2026-01-24] Admin users redirect to /admin after login** – When an admin user signs in (via email/password or OAuth), they are redirected to `/admin` instead of `/dashboard`. This provides immediate access to the admin panel without requiring navigation. Regular members still redirect to `/dashboard`. Check is performed after successful authentication by querying the user's profile for `is_admin` flag.

**[2026-01-24] Session refresh via redirect after sign-in** – After creating and signing in a new user on the success page, an immediate redirect to the same page is triggered. This is necessary because SvelteKit hooks run before page load functions, so the session cookie set during sign-in isn't available until the next request. The redirect ensures the header shows the authenticated user state.

## SEO & Indexing

**[2026-01-24] Admin pages use noindex robots meta tag** – All 18 admin pages now include `<meta name="robots" content="noindex" />` to prevent search engine indexing. Admin pages contain sensitive management functionality and should never appear in search results. Public pages retain their SEO metadata (title, description) without noindex restrictions.

## API Endpoints

**[2026-01-24] Newsletter subscription endpoint** – Created `/api/newsletter` POST endpoint for newsletter subscriptions. Validates email format, upserts to `newsletter_subscribers` table (creates or updates based on email), returns appropriate success/error responses. Footer form uses JavaScript submission with loading/success/error states instead of traditional form post.

## Legal & Policy

**[2026-01-26] Refund policy updated to 14-day cooling off period** – Changed Terms and Conditions from a 30-day satisfaction guarantee to a 14-day cooling off period. Once the user starts streaming, they are deemed to have begun the course and refunds are not possible. This aligns with digital content regulations and protects against abuse while still offering a reasonable cancellation window.

## UI/UX

**[2026-01-26] Mobile menu redesign for visibility** – Fixed mobile menu being hidden behind Hero carousel. Root cause: `backdrop-blur-sm` on header created a stacking context that interfered with z-index. Solution: removed backdrop blur, used solid white background, increased z-index values (header z-[999], backdrop z-[1000], panel z-[1001]). Also moved `overflow-x-hidden` from layout container to `<main>` element to avoid breaking sticky positioning. Menu now slides from top with max-h-[85vh] and rounded bottom corners, leaving space to tap backdrop to close.

**[2026-01-26] Header logo enlarged with negative positioning** – Made desktop header logo bigger (h-28) and used negative top positioning (-top-8) with negative margin bottom (-mb-8) to overlap the auth bar above while keeping nav bar height compact. Mobile logo remains at h-20.

## Infrastructure & Media

**[2026-01-26] Favicon served from Bunny.net CDN** – Updated favicon to use `logo/logo-white.png` from Bunny.net CDN with automatic resizing. Sizes: 16x16 and 32x32 for standard favicon, 180x180 for Apple touch icon. This ensures consistent branding and leverages CDN caching.

**[2026-01-26] CSS rotation for misoriented carousel images** – Added `rotate` property to Hero carousel Slide interface to handle images that are upside-down or rotated incorrectly at source. Uses Tailwind's `rotate-180` class. Applied to `gathering-thumbnail5.jpg`. Workaround until source image can be corrected in Bunny.net storage.

## Content Management

**[2026-01-26] Blog images temporarily removed** – Removed featured images from blog listing page (thumbnails) and blog entry page (hero image, author avatar). Images will be added back later with proper photography. This avoids displaying placeholder or mismatched images.

**[2026-01-26] Module thumbnail images temporarily removed** – Removed thumbnail images from module detail pages (`/modules/[moduleSlug]`), following the same pattern as blog images. Will be added back later with proper photography. This keeps the site clean while awaiting final image assets.

## Typography

**[2026-01-26] Improved lesson card readability** – Increased lesson card title from `text-base font-medium` to `text-lg font-semibold`, and description from `text-sm` to `text-base` with `line-clamp-2` (was 1). Footer section titles also increased from `text-sm` to `text-lg`. These changes improve scannability and hierarchy on course-related pages.

## Image Optimization

**[2026-01-28] OptimizedImage `sizes` attribute for responsive loading** – Added `sizes` prop to OptimizedImage component to enable proper responsive image selection. The `sizes` attribute tells browsers the display size at different breakpoints, allowing them to pick the optimal image from srcset (400w, 800w, 1200w, 1600w). Also added `loading` prop for eager/lazy control. Removed global `height: auto` style that was overriding Tailwind height classes. Examples: Hero carousel uses `sizes="(max-width: 640px) 320px, 384px"`, Fabric Library uses `sizes="(min-width: 1024px) 50vw, 100vw"`.

**[2026-01-28] Bunny Optimizer required for CDN image resizing** – Bunny.net Storage serves raw files by default. The `?width=` and `?quality=` URL parameters only work when Bunny Optimizer is enabled on the Pull Zone. This is a paid feature that must be enabled in Bunny.net dashboard under CDN → Pull Zones → [zone] → Optimizer.

## UI/UX

**[2026-01-28] Fabric Library lightbox for image zoom** – Added click-to-zoom functionality on Fabric Library page. Clicking a fabric image opens a full-screen lightbox with white semi-transparent backdrop (`bg-white/80`) and blur effect (`backdrop-blur-md`). Close via X button, clicking backdrop, or Escape key. Images display with `object-contain` in both grid and lightbox to show full image without cropping.

## Configuration

**[2026-01-28] Separate CONTACT_EMAIL from ADMIN_EMAIL** – Added `CONTACT_EMAIL` environment variable for contact form submissions, separate from `ADMIN_EMAIL` (used for first admin user). Contact form sends to `CONTACT_EMAIL` with fallback to `ADMIN_EMAIL`. This allows different recipients for admin access vs customer inquiries. Set to `skylersewingsecrets@gmail.com`.

**[2026-01-28] Contact form hidden pending Resend domain verification** – Temporarily removed contact form from `/contact` page. Resend requires domain verification before sending emails from `@skylersewingsecrets.com`. The domain must be added in Resend dashboard with proper DNS records (SPF/DKIM). Form will be restored after verification. Page still shows email link and social media contacts.

**[2026-01-28] Bunny.net CDN pull zone naming corrected** – Changed CDN URL from `skylerssewingsecrets.b-cdn.net` (double 's') to `skylersewingsecrets.b-cdn.net` (single 's') to match the corrected domain name. Updated in `.env` file. The old pull zone with double 's' was created before the domain name correction.

## Content Management

**[2026-01-30] Video duration sync script** – Created `seed/get-video-durations.ts` to fetch video lengths from Bunny.net Video API and update `lessons.json`. The script reads all video URLs from lessons, queries the Bunny API for each video's duration in seconds, rounds to minutes, updates the JSON file, and displays totals. Run with `npx tsx seed/get-video-durations.ts`. This replaces manual duration entry and ensures accuracy.

**[2026-01-30] Course content updated to 40 videos / 264 minutes** – After consolidating Pin Hem tutorials, adding 3 corset tutorials, and removing article-only lessons, the course now has 40 video tutorials totaling 264 minutes (approx. 4½ hours). Updated `course-overview.ts` with new totals and per-module stats. Pricing component updated to display "Approx. 4½ hours of video content" instead of calculated value.

## Terminology

**[2026-01-30] "Tutorials" terminology on module pages** – Changed the heading on module detail pages from "Lessons" to "Tutorials" for consistency with marketing language. Also updated the CTA from "Unlock all lessons" to "Unlock all tutorials". Internal code still uses "lesson" (database columns, variables).

## UI/UX

**[2026-01-30] Dashboard tutorial cards simplified** – Removed thumbnail images from "Continue Learning" cards on the dashboard. Cards now show: module name, larger title (text-lg font-semibold), lesson description (line-clamp-2), duration, and play button. This provides more useful information and faster loading without images.
