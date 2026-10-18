import { eq } from 'drizzle-orm';
import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { load as auditLoad } from '../../src/routes/admin/audit/+page.server.ts';
import { load as listLoad } from '../../src/routes/admin/orders/+page.server.ts';
import { actions, load } from '../../src/routes/admin/orders/[id]/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD, seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, orders, profiles } = schema;

type ActionName = keyof typeof actions;
type ActionEvent = Parameters<(typeof actions)['addNote']>[0];
type ListEvent = Parameters<typeof listLoad>[0];
type ListData = import('../../src/routes/admin/orders/$types').PageServerData;
type DetailEvent = Parameters<typeof load>[0];
type DetailData = import('../../src/routes/admin/orders/[id]/$types').PageServerData;
type AuditEvent = Parameters<typeof auditLoad>[0];
type AuditData = import('../../src/routes/admin/audit/$types').PageServerData;

interface FormResult {
	form: { valid: boolean; message?: string; errors: Record<string, string[] | undefined> };
}

/** The status and superforms state of a `fail()` an action returned. */
function failed(result: unknown): { status: number; form: FormResult['form'] } {
	if (!isActionFailure(result)) throw new Error('expected a failure');
	return { status: result.status, form: (result.data as unknown as FormResult).form };
}

describe('/admin/orders', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;
	let pendingId: string;
	let sessionId: string;
	let paidId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await seeded.services.users.createCredentialUser({
			email: 'owner@example.com',
			password: FIXTURE_PASSWORD
		});
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, adminId));

		const { orders: orderService, fulfilment } = seeded.services.commerce;
		const { nobody, bundleOwner } = seeded.users;
		const pending = await orderService.createPendingOrder({
			userId: nobody.id,
			state: { items: [seeded.bundle.id], promoCode: null },
			viewer: { id: nobody.id }
		});
		await orderService.startCheckout(pending.id, { customerEmail: nobody.email });
		pendingId = pending.id;
		sessionId = (await orderService.getById(pending.id))?.stripe_checkout_session_id ?? '';

		const paid = await orderService.createPendingOrder({
			userId: bundleOwner.id,
			state: { items: [seeded.single.id], promoCode: null },
			viewer: { id: bundleOwner.id }
		});
		await orderService.startCheckout(paid.id, { customerEmail: bundleOwner.email });
		const paidSession = (await orderService.getById(paid.id))?.stripe_checkout_session_id ?? '';
		await fulfilment.fulfilOrder(paid.id, seeded.services.payments.markPaid(paidSession));
		paidId = paid.id;
	});

	async function list(userId: string | null, query: string) {
		const event = await memberEvent(seeded.services, userId, { url: `/admin/orders${query}` });
		return outcome(() => listLoad(event as unknown as ListEvent));
	}

	async function submit(
		userId: string | null,
		action: ActionName,
		orderId: string,
		fields: Record<string, string> = {}
	) {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: `/admin/orders/${orderId}?/${action}`,
			body,
			params: { id: orderId }
		});
		return outcome(() => actions[action](event as unknown as ActionEvent));
	}

	it('filters the list by status and searches by email', async () => {
		const paid = (await list(adminId, '?status=paid')) as ListData;
		expect(paid.filters).toEqual({ status: 'paid', q: '', page: 1 });
		expect(paid.orders.rows.map((row) => [row.id, row.status, row.email])).toEqual([
			[paidId, 'paid', 'bundle-owner@example.com']
		]);

		const pending = (await list(adminId, '?status=pending')) as ListData;
		expect(pending.orders.rows.map((row) => row.id)).toEqual([pendingId]);

		const all = (await list(adminId, '?status=bogus')) as ListData;
		expect(all.filters.status).toBeUndefined();
		expect(all.orders.total).toBe(2);

		const searched = (await list(adminId, '?q=nobody%40example')) as ListData;
		expect(searched.orders.rows.map((row) => row.id)).toEqual([pendingId]);

		expect(await list(seeded.users.member.id, '?status=paid')).toBe('redirect 303 /');
	});

	it('saves a note on the order with an audit row', async () => {
		const result = (await submit(adminId, 'addNote', paidId, {
			note: 'Asked for an invoice'
		})) as FormResult;
		expect(result.form.message).toBe('Note saved.');

		const [row] = await db().select().from(orders).where(eq(orders.id, paidId));
		expect(row.admin_notes).toMatch(/ — Asked for an invoice$/);
		const entries = await db()
			.select()
			.from(audit_log)
			.where(eq(audit_log.action, 'order.add_note'));
		expect(entries).toEqual([
			expect.objectContaining({ actor_id: adminId, entity: 'order', entity_id: paidId })
		]);

		const empty = await submit(adminId, 'addNote', paidId, { note: '  ' });
		expect(failed(empty).form.errors.note).toEqual(['Write a note']);

		const missing = await submit(adminId, 'addNote', crypto.randomUUID(), { note: 'Hello' });
		expect(failed(missing).status).toBe(404);
	});

	it('refuses order actions to a non-admin with 403', async () => {
		const { member } = seeded.users;
		expect(await submit(member.id, 'addNote', paidId, { note: 'Sneaky' })).toBe('error 403');
		expect(await submit(member.id, 'rerunFulfilment', pendingId)).toBe('error 403');
		expect(await submit(null, 'addNote', paidId, { note: 'Sneaky' })).toBe('error 401');
		const [row] = await db().select().from(orders).where(eq(orders.id, paidId));
		expect(row.admin_notes).toBeNull();
		expect(await db().select().from(audit_log)).toEqual([]);
	});

	it('re-runs fulfilment for a pending order whose session has since been paid', async () => {
		const unpaid = await submit(adminId, 'rerunFulfilment', pendingId);
		expect(failed(unpaid).status).toBe(400);

		seeded.services.payments.markPaid(sessionId);
		const result = (await submit(adminId, 'rerunFulfilment', pendingId)) as FormResult;
		expect(result.form.message).toBe('Order fulfilled.');
		expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual([
			seeded.bundle.id
		]);

		const again = (await submit(adminId, 'rerunFulfilment', pendingId)) as FormResult;
		expect(again.form.message).toBe('Already fulfilled; nothing changed.');
	});

	it('loads the order detail with Stripe links for an admin', async () => {
		const event = await memberEvent(seeded.services, adminId, {
			url: `/admin/orders/${paidId}`,
			params: { id: paidId }
		});
		const page = (await load(event as unknown as DetailEvent)) as DetailData;
		expect(page.detail.order.status).toBe('paid');
		expect(page.detail.items.map((item) => [item.productId, item.access])).toEqual([
			[seeded.single.id, 'granted']
		]);
		expect(page.detail.links.session).toMatch(
			/^https:\/\/dashboard\.stripe\.com\/test\/search\?query=cs_test_/
		);
		expect(page.forms.addNote).toMatchObject({ id: 'addNote', valid: false });
	});

	it('filters the audit log by entity', async () => {
		await submit(adminId, 'addNote', paidId, { note: 'First' });
		await seeded.services.admin.users.suspend({
			userId: seeded.users.nobody.id,
			reason: 'Spam',
			actorId: adminId
		});
		const event = await memberEvent(seeded.services, adminId, {
			url: `/admin/audit?entity=order&entityId=${paidId}`
		});
		const page = (await auditLoad(event as unknown as AuditEvent)) as AuditData;
		expect(page.entries.rows.map((row) => [row.action, row.entityId])).toEqual([
			['order.add_note', paidId]
		]);
		const everything = (await auditLoad(
			(await memberEvent(seeded.services, adminId, {
				url: '/admin/audit'
			})) as unknown as AuditEvent
		)) as AuditData;
		expect(everything.entries.total).toBe(2);
	});
});
