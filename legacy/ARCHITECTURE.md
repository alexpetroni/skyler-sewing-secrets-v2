# ARCHITECTURE.md



## High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        SvelteKit App                            │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│  Marketing  │   Member    │    Admin    │    Auth     │   API   │
│    Pages    │  Dashboard  │    Panel    │    Flow     │ Routes  │
└─────────────┴──────┬──────┴──────┬──────┴──────┬──────┴────┬────┘
                     │             │             │           │
              ┌──────▼─────────────▼─────────────▼───────────▼────┐
              │              hooks.server.ts                      │
              │         (Session & Auth Middleware)               │
              └──────────────────────┬────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
┌───────▼───────┐          ┌─────────▼─────────┐        ┌─────────▼─────────┐
│   Supabase    │          │      Stripe       │        │     Bunny.net     │
│  (Database +  │          │    (Payments)     │        │  (Video Hosting)  │
│     Auth)     │          │                   │        │                   │
└───────────────┘          └───────────────────┘        └───────────────────┘
```

### Component Responsibilities

- **Marketing Pages** (`/`, `/about`, `/faq`, `/blog`, `/testimonials`): Public content, SEO, conversion
- **Member Dashboard** (`/dashboard`, `/modules/*`): Course access, progress tracking
- **Admin Panel** (`/admin/*`): Content management, user management, analytics
- **Auth Flow** (`/auth/*`): Sign-in, sign-out, OAuth callbacks, password reset
- **API Routes** (`/api/*`): Webhooks, progress updates, newsletter subscription, health checks
- **Static Data** (`src/lib/data/`): Application-level constants and statistics (course overview, etc.)

## Data Flow

### Authentication Flow
```
User → Sign In Page → Supabase Auth → Callback → Session Cookie → hooks.server.ts → locals.user
```

### Purchase Flow
```
Checkout Page → Stripe Checkout → Success Page → Create Account (if new) → Sign In → Redirect to Dashboard
```
Note: Account creation happens on the success page, not in the webhook, because webhooks cannot access browser cookies needed for pending signup data.

### Admin Login Flow
```
Sign In → Check is_admin → Redirect to /admin (admins) or /dashboard (members)
```

### Course Progress Flow
```
Lesson Page → Mark Complete Button → POST /api/progress → Insert user_progress → Update UI
```

### Content Loading Flow
```
+page.server.ts (load) → locals.supabase query → Return data → +page.svelte renders
```

### Homepage Module Stats
```
Home +page.server.ts → Load modules with lessons → ModulesPreview calculates stats → Displays videos/minutes/slides
```
Note: Tutorial slides come from `src/lib/data/course-overview.ts` (not in database).

## Key Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| User Profile | `profiles` | User data, membership status, admin flag |
| Module | `modules` | Course sections (e.g., "Seams", "Zippers") |
| Lesson | `lessons` | Individual videos/articles within modules |
| Progress | `user_progress` | Tracks lesson completion per user |
| Payment | `payments` | Stripe payment records |
| Blog Post | `blog_posts` | Marketing blog content |
| Testimonial | `testimonials` | Customer reviews (with country field for international students) |
| Promo Code | `promo_codes` | Discount codes for checkout |

## Component Organization

| Component | Path | Purpose |
|-----------|------|---------|
| UI Components | `$lib/components/ui/` | Generic reusable components (Button, Card, Badge, etc.) |
| Marketing | `$lib/components/marketing/` | Homepage sections (Hero with image/video carousel, Features, Pricing, etc.) |
| Course | `$lib/components/course/` | Course-specific components (VideoPlayer, ProgressBar, etc.) |
| Layout | `$lib/components/layout/` | Header, Footer |
| Auth | `$lib/components/auth/` | OAuth buttons |
| OptimizedImage | `$lib/components/ui/OptimizedImage.svelte` | Bunny.net CDN images with responsive `srcset` and `sizes` |

### Hero Carousel
- Supports both images and video thumbnails (with play icon overlay)
- Auto-advances every 4 seconds with manual prev/next controls
- Uses `OptimizedImage` for CDN-optimized loading
- Video slides marked with `videoUrl` display a play button overlay and open modal on click
- Slides support `rotate` property for CSS rotation (e.g., `rotate: 180`)

### Fabric Library
- Displays fabric images in 4:3 container with `object-contain` (no cropping)
- Click-to-zoom lightbox with full-screen image view
- Lightbox has white semi-transparent backdrop with blur effect
- Close via X button, clicking outside, or Escape key

### Mobile Menu
- Slides down from top with 85% viewport height max
- Dark backdrop overlay for closing by tapping outside
- Header uses `z-[999]`, menu backdrop `z-[1000]`, panel `z-[1001]`
- Note: `backdrop-blur` on header breaks mobile menu stacking - use solid background instead

## External Services

### Supabase
- **Auth**: Email/password, Google OAuth, magic links
- **Database**: PostgreSQL with Row Level Security
- **Access**: 
  - `locals.supabase` - Respects RLS (user context)
  - `locals.supabaseAdmin` - Bypasses RLS (server-only)

### Stripe
- **Mode**: One-time payment (not subscriptions)
- **Integration**: Stripe Checkout (hosted payment page)
- **Webhook**: `/api/stripe/webhook` handles `checkout.session.completed`
- **On Success**: Sets `profiles.is_member = true`, records payment

### Bunny.net
- **Purpose**: Video hosting, streaming, and image CDN with optimization
- **Container Hosting**: Production deployment via Bunny.net Containers
- **Video URL Format**: `bunny:{libraryId}/{videoId}`
- **Video Embed**: Converted to iframe URL at render time
- **Video API**: `seed/get-video-durations.ts` syncs video lengths from Bunny API
- **Image CDN**: Static images served via Bunny Storage with automatic resizing
- **Image URL Format**: `{CDN_URL}/{path}?width={w}&quality={q}`
- **Image Optimization**: On-the-fly resizing (400px, 800px, 1200px, 1600px) and quality control
- **Component**: `OptimizedImage.svelte` generates responsive `srcset` with CDN URLs

### Resend
- **Purpose**: Transactional emails
- **Use Cases**: Welcome emails, password reset, purchase confirmation

## Security Model

### Row Level Security (RLS)
- All tables have RLS enabled
- Users can only read/write their own progress
- Only admins can modify content tables
- Public read access for published content only

### Protected Routes
| Route Pattern | Requirement |
|---------------|-------------|
| `/dashboard/*` | `is_member = true` |
| `/modules/*/[lesson]` | `is_member = true` OR `is_free_preview = true` |
| `/admin/*` | `is_admin = true` |

### Auth Validation
- Session validated on every request in `hooks.server.ts`
- JWT verified via `supabase.auth.getUser()`
- Profile fetched and attached to `locals.profile`

## Known Constraints

### Performance
- **Video Loading**: Bunny.net CDN handles delivery; no server-side processing
- **Database Queries**: Most pages make 1-3 queries; no complex joins
- **SSR**: All pages server-rendered for SEO; no client-side data fetching

### Limitations
- **No Subscriptions**: Single lifetime payment only
- **No Video Upload**: Videos managed directly in Bunny.net dashboard
- **No Search**: No full-text search implementation
- **No i18n**: English only

### Scalability Considerations
- Supabase connection pooling handles concurrent users
- Static assets served from `/static` (consider CDN for production)
- No caching layer; relies on Supabase query performance

## Deployment

### Docker
- **Image**: Multi-stage Dockerfile for optimized production builds
- **Registry**: GitHub Container Registry (ghcr.io)
- **Port**: Application listens on port 3000
- **Health Check**: `GET /api/health`

### Container Build
```bash
docker build -t ghcr.io/alexpetroni/skylers-sewing-secrets:latest .
docker push ghcr.io/alexpetroni/skylers-sewing-secrets:latest
```

### Production (Bunny.net Containers)
- Pull image from GHCR
- Configure environment variables
- Container exposes port 3000


