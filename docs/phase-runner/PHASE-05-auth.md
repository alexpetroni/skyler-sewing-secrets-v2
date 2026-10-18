# PHASE-05 — Auth: Better Auth, profiles, access predicates, hook pipeline, auth routes

## Why

Members must sign in with the credentials they already have (UUIDs and bcrypt hashes migrated
from Supabase into Better Auth tables by the legacy branch). This phase recreates the legacy
auth model on the new architecture, fixes what the audit found (`02-security-audit.md` H3, H5,
L1), and gives every later phase `event.locals.services`, `locals.user`, `locals.profile` and
`locals.access`.

## Read first

`legacy/src/lib/server/auth.ts`, `legacy/src/lib/server/users.ts`,
`legacy/src/lib/server/access.ts`, `legacy/src/hooks.server.ts`, every file under
`legacy/src/routes/auth/`, `legacy/src/lib/components/auth/`, `legacy/src/app.d.ts`;
`docs/analysis/03-architecture.md` → Request pipeline; `docs/analysis/02-security-audit.md`
H3, H4, H5, L1.

## Deliverables

### 1. Runtime (`src/lib/server/runtime/`)

- `env.ts`: imports from `$app/env/private` and `$app/env/public`, exports a typed
  `RuntimeConfig` object (urls, secrets, provider keys, `databaseDriver`). The only importer
  of `$app/env/private` in `src/lib`.
- `container.ts`: `getServices(): Promise<Services>` lazily creating `db` (`createDb`),
  `auth` (below), `logger` (a temporary console-backed logger until PHASE-06 replaces it),
  and the service objects added by later phases; cached per process. `Services` type is
  exported and extended by later phases.

### 2. Auth module (`src/lib/server/modules/auth/`)

- `create-auth.ts`: `createAuth({ db, secret, baseURL, google?: { clientId, clientSecret },
  sendPasswordReset: (to, url) => Promise<void> })` → `betterAuth({...})` with
  `drizzleAdapter(db, { provider: 'pg', usePlural: true, schema })`,
  `advanced.database.generateId = () => crypto.randomUUID()`, `emailAndPassword` enabled with
  bcrypt hash/verify (cost 10), `disableSignUp: true`, `revokeSessionsOnPasswordReset: true`,
  `resetPasswordTokenExpiresIn: 3600`, `sendResetPassword` → the callback; `socialProviders.google`
  only when both keys are given; `account.accountLinking { enabled: true, trustedProviders: ['google'] }`;
  `rateLimit: { enabled: true, storage: 'database', window: 10, max: 100, customRules: { '/sign-in/email': { window: 60, max: 10 }, '/request-password-reset': { window: 300, max: 5 } } }`;
  `plugins: [twoFactor(), sveltekitCookies(getRequestEvent)]`; `databaseHooks.user.create.after`
  inserts the `profiles` row (`onConflictDoNothing`). Export `Auth`, `AuthUser`, `AuthSession`.
- `service.ts`: `createAuthService({ db })` with `findUserIdByEmail`, `createCredentialUser({ email, password, fullName })`
  (users + accounts + profiles in `withTx`; **`emailVerified: false`**), `markEmailVerified(userId)`,
  `ensureProfile`, `getProfile(userId)`, `updateProfile(userId, { fullName })`,
  `suspend(userId, reason, actorId)` (refuses admins; sets flags; deletes `sessions` rows),
  `unsuspend`, `setAdmin(userId, isAdmin, actorId)`, `revokeAllSessions(userId)`.
  Admin-affecting functions write `audit_log` (table from PHASE-04) in the same transaction.
- `access.ts`: `isActiveAdmin(profile)`, `isSuspended(profile)`, `requireUser(event, redirectTo)`,
  `requireAdmin(event)` (401/403 for non-GET, redirects for GET as legacy),
  `SUSPENDED_MESSAGE`. Member/entitlement predicates come in PHASE-08.
- `index.ts` exporting the public API and types (`Profile`, `Viewer`).

### 3. Hook pipeline (`src/lib/server/http/`)

- `security-headers.ts`: `withSecurityHeaders(response, url)` ported from legacy (no CSP yet).
- `create-handle.ts`: `createHandle({ getServices, isMaintenanceExempt })` returning a `Handle`
  built with `sequence(...)`: (a) `/api/auth/*` passthrough to `svelteKitHandler` with headers;
  (b) session + profile → `locals.user`, `locals.profile`, `locals.services`, `locals.requestId`
  (`crypto.randomUUID()`), `locals.access = { isAdmin, isSuspended, allAccess: false }`
  (`allAccess` is computed in PHASE-08; set `false` here with a TODO-free comment saying
  which phase fills it); self-heal a missing profile; (c) maintenance gate reading
  `site_settings` via a 30-second in-process cache, exempt prefixes as legacy plus `/api/webhooks/`;
  (d) admin gate (`isActiveAdmin`, GET → redirect, else 401/403); (e) headers on every
  response including thrown redirects/errors (port the legacy `applyGates` try/catch).
  `handleError` ported (`errorId`, generic 5xx message, logs via the logger).
- `src/hooks.server.ts`: `export const handle = createHandle({ getServices, isMaintenanceExempt })`;
  `export { handleError }`.
- `src/app.d.ts`: `Locals { services: Services; user: AuthUser | null; profile: Profile | null; access: Access; requestId: string; maintenanceMode: boolean }`,
  `PageData { viewer: Viewer | null; maintenance: boolean }`.
- `src/routes/+layout.server.ts` returns `viewer` (name, avatar, isAdmin) and `maintenance`.

### 4. Auth routes (`src/routes/(auth)/`)

Port `sign-in` (page + action: validation, `signInEmail`, admin → `/admin`, else
`safeRelativeTarget(redirectTo)`; stale session without profile → sign out),
`forgot-password`, `reset-password`, `redirect` (post-OAuth router), `oauth` (POST →
`signInSocial`), `sign-out`, with `AuthShell.svelte` and `OAuthButtons.svelte` ported to
`src/lib/components/auth/`. `src/lib/server/http/redirects.ts`: `safeRelativeTarget` ported.
Google button rendered only when Google is configured (`data.googleEnabled`).

### 5. Tests (PGlite, no network)

- `modules/auth/service.test.ts`: `createCredentialUser` creates three rows with
  `email_verified = false` and lower-cased email; duplicate email throws; `suspend` sets flags,
  deletes sessions, refuses an admin, writes `audit_log`; `setAdmin` writes `audit_log`.
- `modules/auth/create-auth.test.ts`: build `createAuth` on PGlite with a fake
  `sendPasswordReset`; `signInEmail` with the created user's password returns a session and a
  `set-cookie` header; a wrong password is rejected; `requestPasswordReset` calls the callback
  with a URL containing a token; `resetPassword` with that token changes the password **and
  deletes existing sessions** (sign in, reset, old session cookie no longer resolves).
- `tests/routes/hooks.test.ts`: `createHandle` with fake services/db: signed-out `GET /admin` →
  303 to `/auth/sign-in?redirectTo=%2Fadmin`; `POST /admin/x` → 401; non-admin → 303 `/` /
  403; suspended admin → treated as non-admin; `/api/auth/foo` skips session lookup; every
  response has `X-Content-Type-Options: nosniff`; maintenance on → `/` 503 for visitors, 200
  for admins, `/api/webhooks/stripe` exempt.
- `tests/routes/sign-in.test.ts`: the sign-in action with a FormData body: wrong password →
  `fail(400)`; right password → redirect 303 with a `set-cookie`; `redirectTo=//evil.com`
  falls back to `/library`.
- `http/redirects.test.ts`: the legacy `safeRelativeTarget` cases (default fallback `/library`).

Out of scope: 2FA enforcement UI (PHASE-20; the plugin is merely enabled), Google login
end-to-end (human), rate-limit UI, entitlements.

## Steps

1. Runtime env + container, commit.
2. Auth module (create-auth, service, access), tests, commit.
3. Hook pipeline + hooks.server.ts + app.d.ts + layout server, tests, commit.
4. Auth routes + components, tests, commit.
5. Gate once; also the no-env build.

## Definition of Done

- [ ] `grep -rln "\$app/env/private" src/lib | sort` prints exactly `src/lib/server/runtime/env.ts`; `grep -rn "process.env" src/` returns nothing.
- [ ] `create-auth.ts` sets `disableSignUp: true`, `revokeSessionsOnPasswordReset: true`, `rateLimit.storage: 'database'`, `trustedProviders: ['google']`, bcrypt hash/verify, `twoFactor()` plugin (reviewer reads the file).
- [ ] `createCredentialUser` inserts `emailVerified: false` (test asserts it); there is no code path granting `is_admin` from an email address or a purchase (`grep -rn "ADMIN_EMAIL" src` returns nothing).
- [ ] `src/hooks.server.ts` is under 15 lines and delegates to `createHandle`; the pipeline uses `sequence` from `@sveltejs/kit/hooks`.
- [ ] The eight test files/cases listed exist and pass; `tests/routes/hooks.test.ts` covers the seven listed behaviours.
- [ ] Auth routes exist under `src/routes/(auth)/` with the legacy UX (reviewer compares with `legacy/src/routes/auth/`); Google UI is conditional on configuration.
- [ ] `env -i PATH="$PATH" HOME="$HOME" npm run build` succeeds (the container is lazy).
- [ ] Gate green.
