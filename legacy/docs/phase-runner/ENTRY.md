# Skyler's Sewing Secrets — build constitution

This file is prepended to every builder and reviewer prompt. It states the
mission, the binding engineering rules, what the sandbox can and cannot do,
and how work is verified. Phase scoping is added by the runner.

## Mission

Skyler's Sewing Secrets is an online sewing course: a marketing site, Stripe
Checkout for one-time lifetime access, a member area with video lessons and
progress tracking, and an admin panel. Stack: SvelteKit 2 + Svelte 5 (runes),
TypeScript, Neon Postgres via Drizzle ORM, Better Auth (email/password with
bcrypt + Google OAuth), Stripe, Resend (email), Bunny.net (video).

The branch `vercel-neon-migration` holds a completed Supabase → Neon / Better
Auth migration that has not been cut over yet. Row Level Security is gone;
every access rule it used to enforce must now be enforced explicitly in
server code. Phases 1–8 come from a code review of that branch (2026-09-03)
and harden authorization, the payment flow, and input handling. Phases 9–14
come from a second review (2026-09-05): payment ownership, suspension
semantics, the public attack surface, site-wide maintenance mode, admin form
validation, and unit tests. Phase 15 collects the small follow-ups those
reviews left open.

"Done" for the product: the site behaves as it did before the migration, no
member or admin data is reachable without the matching `profiles` flag, and
the payment flow cannot grant or revoke privileges it should not.

## Read before changing anything

- `CLAUDE.md` — conventions, folder structure, what to avoid. Binding.
- `src/lib/server/db/schema.ts` — the only source of truth for tables and columns.
- `src/hooks.server.ts`, `src/lib/server/auth.ts`, `src/lib/server/users.ts` — the auth model.
- `src/routes/api/stripe/webhook/+server.ts` and `src/routes/checkout/**` — the payment flow.

## Binding engineering rules

1. TypeScript everywhere, Svelte 5 runes (`$props`, `$state`, `$derived`), `{#snippet}` for children. No `any`. Single quotes in TS, tabs for indentation, kebab-case files.
2. **Server-side authorization is the only safety net.** Every `load`, form action and `+server.ts` handler that touches member or admin data checks `locals.profile` (`is_member`, `is_admin`, `is_suspended`) itself. A layout `load` does not protect form actions: SvelteKit runs actions before layout loads.
3. No new runtime dependencies. Do not add a test framework unless a phase explicitly says so.
4. Never modify anything under `drizzle/` or `supabase/`. Schema changes are out of scope for every phase in this plan.
5. Never commit `.env*` files (except `.env.example`) or secrets. Never print `.env` contents.
6. Keep each diff to the files the phase names. Drive-by refactors, formatting passes and unrelated cleanups fail review.
7. Preserve existing behaviour unless the phase says otherwise. Keep the existing `console.log('[webhook] …')` / `console.error('[success] …')` logging style; log errors with `console.error`.
8. Use `fail()` for form-action errors, `error()` for HTTP errors, `redirect()` for redirects, all from `@sveltejs/kit`. Return user-friendly messages, never raw error details.
9. Conventional commits, one logical change per commit. Work on the checked-out branch only. Never touch `vercel` or `main`.

## What the sandbox can and cannot do

There is no `DATABASE_URL`, no Stripe, Resend or Google credential, and no
database. Do not try to run the app against a database, seed, migrate, call
external APIs, or create `.env` files. If a command insists on an env var,
pass a dummy value inline for that single command. Verification is static:
type-check, production build, and reading code.

## Verification commands — must be green

```
npm run check      # svelte-check: 0 errors
npm run build      # production build with no env vars set
```

Two a11y warnings from `svelte-check` are pre-existing and accepted
(`src/routes/admin/+layout.svelte` static-element click handler,
`src/routes/admin/pricing/+page.svelte` unlabelled Discount Type select).
No phase may add warnings.

The runner's gate runs both commands (plus `npm test` once Phase 14 has
added it). The independent reviewer verifies each Definition of Done item by
reading the files and grepping; write code that makes those checks obvious
(clear names, comments that state the invariant).

## Domain facts every phase relies on

- Prices are integer **pence**: `pricing_config.base_price` defaults to `14900` (£149.00). `promo_codes.discount_value` is an integer column: whole percent for `percentage`, whole pence for `fixed`.
- `profiles` is the app-level user row, keyed by Better Auth `users.id`. `locals.user` is the auth user (id, email, name, image); `locals.profile` is the app profile with `is_member`, `is_admin`, `is_suspended`, `full_name`, `avatar_url`, `member_since`.
- `src/lib/server/users.ts` exposes `findUserIdByEmail`, `createCredentialUser` (users + accounts + profiles rows, email lower-cased), `ensureProfile` (insert-or-ignore). `setUserPassword` was removed in Phase 5.
- Better Auth: `getAuth().api.requestPasswordReset({ body: { email, redirectTo: '/auth/reset-password' } })` sends the reset email through `sendResetPassword` in `src/lib/server/auth.ts` and is silent for unknown emails. `resetPassword` creates a credential account when the user has none. `signInEmail({ body, headers })` sets the session cookie through the `sveltekitCookies` plugin, so it works inside loads and actions.
- Stripe: `checkout.session.completed` can arrive with `payment_status !== 'paid'` for delayed payment methods. Session metadata keys are `promo_code_id` and `user_id` (Phase 5 removed `pending_signup` and `full_name`).
- Drizzle: an update whose value is a SQL expression (for example `sql\`coalesce(${profiles.member_since}, now())\``) needs the set object typed as `PgUpdateSetSource<typeof profiles>` from `drizzle-orm/pg-core`; `Partial<typeof table.$inferInsert>` rejects `SQL`.
- The `/auth/sign-in` page reads the return target from the `redirectTo` query parameter and validates it with `safeRelativeTarget` in `src/lib/server/redirects.ts`.
- Since Phase 5 the checkout action creates the account and signs the buyer in before creating the Stripe session, so `metadata.user_id` is set for every new session; the webhook and success page keep an email fallback (`session.customer_details?.email || session.customer_email`) for sessions created before that deploy. `payments.stripe_checkout_session_id` is UNIQUE, so `insert … onConflictDoNothing().returning()` returns an empty array when a session was already recorded — that existing row's `user_id` is who it was recorded for.
- Better Auth's `emailAndPassword.disableSignUp` disables only `POST /api/auth/sign-up/email`; sign-in, password reset and Google sign-in are unaffected. The app never creates credential users through Better Auth (it inserts rows via `createCredentialUser`).
- The Better Auth `sessions` table is in the Drizzle schema as `sessions` (`userId`, `token`, …). No cookie cache is configured, so deleting a user's rows signs them out on their next request.
- In `src/hooks.server.ts` the final `svelteKitHandler(...)` call returns the `Response`; to add response headers, `await` it and set them before returning. `redirect()` and `error()` from `@sveltejs/kit` throw and may be used inside the hook; `isRedirect(e)` / `isHttpError(e)` (also from `@sveltejs/kit`) identify them in a `catch`, with `e.status`, `e.location` and `e.body.message`.
- The database driver is `drizzle-orm/neon-http` over `@neondatabase/serverless`: `db.transaction()` throws ("No transactions support in neon-http driver"); `db.batch([q1, q2, …])` runs the queries in one transaction and is the way to make multi-row writes atomic.
- `site_settings` is a key/value table; `maintenance_mode` is `'true'` or `'false'`.
- Vitest (Phase 14 onwards only): tests live next to their module as `*.test.ts`; the SvelteKit Vite plugin resolves `$lib` and `$env/dynamic/*` under Vitest, but `$env/dynamic/private` is a frozen object built at config time, so tests that need env values `vi.mock('$env/dynamic/private', …)` at the top of the file; never import `$lib/server/auth` or `$lib/server/db` from a unit test.
- SvelteKit sets `event.isDataRequest` to `true` for `__data.json` requests (client-side navigation); `event.url.pathname` is already stripped of the suffix.
