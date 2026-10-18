# PHASE-21 — Observability and operations: Sentry, request ids, health, runtime limits, ops runbook

## Why

Errors must be visible and traceable before real buyers arrive. The hook already produces an
error id; this phase connects it to Sentry (optional by configuration), stamps every response with
a request id, makes the health check honest, and documents operations.

## Read first

`src/lib/server/http/create-handle.ts`, `src/hooks.server.ts`, `src/lib/server/platform/logger.ts`,
`src/env.ts`, `vercel.json`, `docs/analysis/01-neon-cutover.md` (post-cutover tasks the ops
doc must cover), Sentry SvelteKit docs via the Svelte MCP or `node_modules/@sentry/sveltekit/README`.

## Deliverables

1. **Sentry** (`@sentry/sveltekit`, runtime dependency named here): `src/hooks.client.ts`
   with `Sentry.init` only when `PUBLIC_SENTRY_DSN` is set (declare it public + optional;
   `SENTRY_DSN` private optional for the server); server init in `src/hooks.server.ts` via
   `Sentry.init` + `sentryHandle()` placed first in `sequence`, `handleError` wrapped with
   `Sentry.handleErrorWithSentry(ourHandleError)`; `tracesSampleRate 0.1`; `sendDefaultPii:
   false`; `beforeSend` strips `request.cookies` and `user.email`. The build must still pass
   with no env (no source-map upload step; document how to add it later).
2. **Request ids**: `locals.requestId` already exists; set `x-request-id` on every response in
   `withSecurityHeaders` (rename to `withStandardHeaders`), include it in `handleError`'s log
   line and in the rendered error page (`errorId` = `requestId`), bind it into a per-request
   child logger stored on `locals.log` and used by routes instead of `services.logger`.
3. **Health**: `GET /api/health` → `{ status: 'ok', db: 'ok', version }` with `select 1`
   through the db (5 s timeout) → 503 `{ status: 'degraded', db: 'error' }` on failure; no
   secrets, no cache (`Cache-Control: no-store`).
4. **Function limits**: `export const config = { maxDuration: 60 }` on the Stripe and Bunny
   webhooks and both job endpoints; `maxDuration: 30` on `/admin/api/upload`; a comment in
   `vite.config.ts` about `regions` to be set by the human to the Neon region.
5. **Ops runbook** `docs/runbooks/operations.md`: environment variables with where each is
   used, cron entries, how to read logs (request id → Vercel logs → Sentry), rotating keys,
   the Bunny and Stripe dashboard settings the app assumes, the maintenance switch, backups
   (Neon PITR), and the alerts to set up (Sentry, Vercel cron failures, Stripe webhook failure
   emails).
6. **Env consistency script**: `scripts/check-env.ts` (tsx): parses `src/env.ts` for declared
   names and `.env.example` for documented names, exits 1 listing differences; a Vitest test
   `tests/env-example.test.ts` runs the same comparison so the gate catches drift.

### Tests

`tests/routes/health.test.ts` (200 with a working PGlite db; 503 when the injected db throws);
hook test for `x-request-id` on normal, redirect and error responses; `tests/env-example.test.ts`.

Out of scope: dashboards, uptime monitoring services, OpenTelemetry tracing.

## Steps

1. Sentry wiring + no-env build check, commit.
2. Request ids + logger binding + health + limits + tests, commit.
3. Runbook + env script + test, commit; gate once.

## Definition of Done

- [ ] `env -i PATH="$PATH" HOME="$HOME" npm run build` still succeeds with Sentry installed; Sentry initialises only when a DSN is present (reviewer reads both hooks files).
- [ ] Every response carries `x-request-id` (hook test, three response kinds); the error page shows it.
- [ ] `/api/health` returns 503 when the database fails (test) and never leaks configuration.
- [ ] `tests/env-example.test.ts` passes and fails when a variable is removed from `.env.example` (reviewer may try it locally and revert).
- [ ] `docs/runbooks/operations.md` exists with the six sections named above.
- [ ] Gate green.
