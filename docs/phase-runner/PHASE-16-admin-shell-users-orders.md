# PHASE-16 — Admin: shell, dashboard, users, orders, audit log; superforms introduced

## Why

The owner needs to see money and people and to fix things: who owns what, why, and since when.
This phase lays the admin foundation (layout, form handling, audit viewer) that the three
following admin phases build on.

## Read first

`docs/analysis/04-admin-offers.md` → Admin information architecture, Orders, Users, Dashboard,
Implementation notes; `legacy/src/routes/admin/+layout.*`, `legacy/src/routes/admin/+page.*`,
`legacy/src/routes/admin/users/*`, `legacy/src/lib/components/admin/*`;
`src/lib/server/modules/{auth,entitlements,commerce}`.

## Deliverables

### 1. Form handling

Add `sveltekit-superforms` (runtime dependency, named here). `src/lib/server/http/forms.ts`:
`adminForm(schema)` helpers around `superValidate(request, valibot(schema))` returning either
`{ ok: true, data }` or a ready `fail(400, { form })`; `mapDomainError(form, err)` turning
`DomainError` codes into form-level or field messages. Client side,
`src/lib/components/admin/Form.svelte` wrapping `superForm` with the UI kit inputs
(`FormField.svelte` for label/error/hint), a `ConfirmForm.svelte` requiring a typed phrase for
destructive actions, and `AdminPage.svelte`, `AdminHeader.svelte`, `AdminSidebar.svelte`
(ported, nav from the analysis IA), `Stat.svelte`, `DataTable.svelte` (sortable header,
pagination props, snippet for rows).

### 2. `src/lib/server/modules/admin/`

`createAdminService({ db, auth, entitlements, orders, fulfilment, catalog, gateway, log })`:
`dashboard(now)` (last-30-day revenue and order count by product kind, new buyers, top five
products by revenue, active promotions with redemption counts, media processing/failed counts,
unread contacts); `users.search(q, page)` (email/name, plus flags), `users.detail(id)` (profile,
orders, entitlements with source/actor, progress summary, session count);
`users.grantProduct({ userId, productId, actorId, reason })` → `entitlements.grant(source 'admin_grant')`
+ audit; `users.revokeProduct`; `orders.list({ status?, q?, page })`,
`orders.detail(id)` (items, events from `webhook_events` matching the session, audit rows),
`orders.rerunFulfilment(id, actorId)` (retrieve session via gateway → `fulfilOrder`),
`orders.addNote(id, note, actorId)` (`orders.admin_notes text` added by additive migration
`0004_admin.sql`), `audit.list({ entity?, entityId?, actorId?, page })`.

### 3. Routes (`src/routes/admin/`)

- `+layout.server.ts`: `requireAdmin(event)` (second layer; the hook is the first) and
  `viewer`; `+layout.svelte` with sidebar/header; `noindex` meta on every admin page.
- `/admin`: dashboard cards and lists.
- `/admin/users`: search + table; `/admin/users/[id]`: detail with actions `suspend`
  (reason), `unsuspend`, `grant` (product select from `catalog.listAll`), `revoke`,
  `sendReset`, `setAdmin` (ConfirmForm), `revokeSessions`.
- `/admin/orders`: filters (status, search) + table; `/admin/orders/[id]`: detail, Stripe
  links (`https://dashboard.stripe.com/...` built from ids), actions `rerunFulfilment`,
  `addNote`.
- `/admin/audit`: filterable list.
- Every action: `requireAdmin`, schema from `src/lib/shared/schemas/admin.ts`, one service
  call, audit via the service.

### 4. Tests

`admin/service.test.ts` (dashboard numbers from seeded paid/refunded orders across kinds; top
products; `grantProduct` writes entitlement + audit with actor; `rerunFulfilment` fulfils a
pending order whose fake session is paid). `tests/routes/admin-users.test.ts`: `POST
/admin/users/[id]?/suspend` by a non-admin → 403 even when called directly (no layout);
suspend with reason → flags + audit; grant by admin → entitlement. `tests/routes/admin-orders.test.ts`:
list filter by status; note saved. SSR render test for `DataTable` with a row snippet.

Out of scope: content, media, catalogue, promotions, marketing admin (next phases); 2FA (PHASE-20).

## Steps

1. Migration `0004_admin.sql`, superforms + form helpers + components, commit.
2. Admin service + tests, commit.
3. Layout, dashboard, users, orders, audit routes + tests, commit.
4. Gate once.

## Definition of Done

- [ ] `sveltekit-superforms` is the only dependency added; every admin action in this phase validates through `adminForm(schema)` (grep for `formData.get(` under `src/routes/admin/` returns nothing).
- [ ] A non-admin `POST` to an admin action returns 403 without the layout running (test), proving per-action authorization.
- [ ] `grantProduct`, `suspend`, `setAdmin`, `addNote` each write an `audit_log` row (tests or reviewer-run query in a test).
- [ ] Dashboard metrics test matches seeded data; `rerunFulfilment` test fulfils.
- [ ] `0004_admin.sql` is additive (`admin_notes` nullable) and `drizzle-kit generate` is a no-op afterwards.
- [ ] Gate green.
