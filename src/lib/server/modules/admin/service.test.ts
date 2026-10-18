import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '#lib/server/db/index.ts';
import { seedCatalog, type SeededCatalog } from '../../../../../tests/helpers/fixtures.ts';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { DomainError } from '../errors.ts';
import { stripeLinks } from './service.ts';

// Better Auth's sveltekitCookies plugin looks for a request event; there is none here.
vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const {
	audit_log,
	contact_submissions,
	entitlements,
	media_assets,
	order_items,
	orders,
	profiles,
	promo_codes,
	promo_redemptions,
	sessions
} = schema;

const NOW = new Date('2026-10-18T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe('createAdminService', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await seeded.services.users.createCredentialUser({
			email: 'owner@example.com',
			password: 'a-good-password',
			fullName: 'Owner'
		});
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, adminId));
	});

	const admin = () => seeded.services.admin;

	const auditRows = (action: string) =>
		db().select().from(audit_log).where(eq(audit_log.action, action));

	async function buyer(email: string): Promise<string> {
		return seeded.services.users.createCredentialUser({ email, password: 'a-good-password' });
	}

	/** An order row as fulfilment leaves it, with one item per `[productId, title, unitPrice, refunded]`. */
	async function seedOrder(
		userId: string,
		status: (typeof orders.$inferInsert)['status'],
		paidAt: string | null,
		lines: Array<[string, string, number, number?]>
	): Promise<string> {
		const total = lines.reduce((sum, [, , price]) => sum + price, 0);
		const [order] = await db()
			.insert(orders)
			.values({ user_id: userId, status, subtotal: total, total, paid_at: paidAt })
			.returning();
		await db()
			.insert(order_items)
			.values(
				lines.map(([productId, title, price, refunded = 0]) => ({
					order_id: order.id,
					product_id: productId,
					product_title: title,
					list_price: price,
					unit_price: price,
					refunded_amount: refunded
				}))
			);
		return order.id;
	}

	describe('dashboard', () => {
		it('counts the last 30 days of paid orders by kind, net of refunds, with buyers, products, promotions, media and inbox', async () => {
			const { flagship, bundle, single } = seeded;
			const returning = await buyer('returning@example.com');
			const fresh = await buyer('fresh@example.com');
			const refunded = await buyer('refunded@example.com');

			// Outside the window: excluded, and it makes `returning` an old buyer.
			await seedOrder(returning, 'paid', daysAgo(40), [[bundle.id, 'Bundle', 2900]]);
			const recent = await seedOrder(returning, 'paid', daysAgo(5), [[bundle.id, 'Bundle', 2900]]);
			await seedOrder(fresh, 'paid', daysAgo(10), [
				[flagship.id, 'Course', 14900],
				[single.id, 'Single', 900]
			]);
			await seedOrder(fresh, 'partially_refunded', daysAgo(2), [[single.id, 'Single', 900, 400]]);
			await seedOrder(refunded, 'refunded', daysAgo(3), [[single.id, 'Single', 900, 900]]);
			// Never paid: not revenue, not a buyer.
			const pending = await seedOrder(seeded.users.nobody.id, 'pending', null, [
				[single.id, 'Single', 900]
			]);
			const expired = await seedOrder(seeded.users.nobody.id, 'expired', null, [
				[single.id, 'Single', 900]
			]);

			const [live] = await db()
				.insert(promo_codes)
				.values({ code: 'LIVE10', discount_value: 10, is_active: true })
				.returning();
			await db()
				.insert(promo_codes)
				.values([
					{ code: 'OFF', discount_value: 10, is_active: false },
					{ code: 'OVER', discount_value: 10, is_active: true, ends_at: daysAgo(1) }
				]);
			await db()
				.insert(promo_redemptions)
				.values([
					{ promo_code_id: live.id, order_id: recent, user_id: returning, discount_total: 290 },
					{
						promo_code_id: live.id,
						order_id: pending,
						user_id: seeded.users.nobody.id,
						discount_total: 90
					},
					// An expired order's redemption was released; it does not count.
					{
						promo_code_id: live.id,
						order_id: expired,
						user_id: seeded.users.nobody.id,
						discount_total: 90
					}
				]);

			await db()
				.insert(media_assets)
				.values([
					{ library_id: '100', video_id: 'processing-1', status: 'processing' },
					{ library_id: '100', video_id: 'failed-1', status: 'failed' },
					{ library_id: '100', video_id: 'failed-2', status: 'failed' },
					{ library_id: '100', video_id: 'uploading-1', status: 'uploading' }
				]);
			await db()
				.insert(contact_submissions)
				.values([
					{ name: 'A', email: 'a@example.com', message: 'Hello' },
					{ name: 'B', email: 'b@example.com', message: 'Hello' },
					{ name: 'C', email: 'c@example.com', message: 'Hello', is_read: true }
				]);

			const stats = await admin().dashboard(NOW);

			expect(stats.since).toBe(daysAgo(30));
			// 2900 + 14900 + 900 + (900 − 400) + (900 − 900)
			expect(stats.revenue).toBe(19_200);
			expect(stats.orders).toBe(4);
			expect(stats.refunded).toBe(1300);
			expect(stats.byKind).toEqual([
				{ kind: 'course', revenue: 14_900, orders: 1 },
				{ kind: 'bundle', revenue: 2900, orders: 1 },
				{ kind: 'single', revenue: 1400, orders: 3 }
			]);
			expect(stats.newBuyers).toBe(2);
			expect(stats.topProducts).toEqual([
				{
					productId: flagship.id,
					title: flagship.title,
					kind: 'course',
					revenue: 14_900,
					units: 1
				},
				{ productId: bundle.id, title: bundle.title, kind: 'bundle', revenue: 2900, units: 1 },
				{ productId: single.id, title: single.title, kind: 'single', revenue: 1400, units: 3 }
			]);
			expect(stats.activePromotions).toEqual([{ id: live.id, code: 'LIVE10', redemptions: 2 }]);
			expect(stats.media).toEqual({ processing: 1, failed: 2 });
			expect(stats.unreadContacts).toBe(2);
		});

		it('reports zeros for every kind on an empty shop', async () => {
			const stats = await admin().dashboard(NOW);
			expect(stats.revenue).toBe(0);
			expect(stats.orders).toBe(0);
			expect(stats.byKind.map((row) => [row.kind, row.revenue, row.orders])).toEqual([
				['course', 0, 0],
				['bundle', 0, 0],
				['single', 0, 0]
			]);
			expect(stats.topProducts).toEqual([]);
			expect(stats.newBuyers).toBe(0);
		});
	});

	describe('users', () => {
		it('searches by email or name, case-insensitively, with flags and paging', async () => {
			const byName = await admin().users.search('bundle OWNER', 1);
			expect(byName.total).toBe(1);
			expect(byName.rows[0]).toMatchObject({
				email: 'bundle-owner@example.com',
				fullName: 'Bundle Owner',
				isMember: false,
				isAdmin: false,
				isSuspended: false
			});

			const byEmail = await admin().users.search('member@', 1);
			expect(byEmail.rows.map((row) => [row.email, row.isMember])).toEqual([
				['member@example.com', true]
			]);

			const everyone = await admin().users.search('', 1);
			expect(everyone.total).toBe(4);
			expect(everyone.pageCount).toBe(1);
			// `%` is matched literally, not as a wildcard.
			expect((await admin().users.search('%', 1)).total).toBe(0);
		});

		it('grantProduct writes an admin_grant entitlement and an audit row with the actor and reason', async () => {
			const { nobody } = seeded.users;
			const granted = await admin().users.grantProduct({
				userId: nobody.id,
				productId: seeded.bundle.id,
				actorId: adminId,
				reason: 'Competition prize'
			});

			expect(granted).toMatchObject({
				user_id: nobody.id,
				product_id: seeded.bundle.id,
				source: 'admin_grant',
				granted_by: adminId,
				revoked_at: null
			});
			const [entry] = await auditRows('entitlement.grant');
			expect(entry).toMatchObject({
				actor_id: adminId,
				entity: 'entitlement',
				entity_id: granted.id,
				after: {
					user_id: nobody.id,
					product_id: seeded.bundle.id,
					source: 'admin_grant',
					reason: 'Competition prize'
				}
			});
			expect(await seeded.services.entitlements.ownedProductIds(nobody.id)).toEqual([
				seeded.bundle.id
			]);

			await expect(
				admin().users.grantProduct({
					userId: nobody.id,
					productId: seeded.bundle.id,
					actorId: adminId,
					reason: 'again'
				})
			).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
			expect(await auditRows('entitlement.grant')).toHaveLength(1);
		});

		it('granting the course makes the user a member; revoking it with a reason undoes that', async () => {
			const { nobody } = seeded.users;
			await admin().users.grantProduct({
				userId: nobody.id,
				productId: seeded.flagship.id,
				actorId: adminId,
				reason: 'Comp'
			});
			expect((await seeded.services.users.getProfile(nobody.id))?.is_member).toBe(true);

			await admin().users.revokeProduct({
				userId: nobody.id,
				productId: seeded.flagship.id,
				actorId: adminId,
				reason: 'Granted by mistake'
			});
			expect((await seeded.services.users.getProfile(nobody.id))?.is_member).toBe(false);
			const [entry] = await auditRows('entitlement.revoke');
			expect(entry).toMatchObject({
				actor_id: adminId,
				after: { revoke_reason: 'Granted by mistake' }
			});

			await expect(
				admin().users.revokeProduct({
					userId: nobody.id,
					productId: seeded.flagship.id,
					actorId: adminId,
					reason: 'again'
				})
			).rejects.toMatchObject({ code: 'NOT_OWNED' });
		});

		it('refuses a grant for an unknown user or product', async () => {
			await expect(
				admin().users.grantProduct({
					userId: crypto.randomUUID(),
					productId: seeded.bundle.id,
					actorId: adminId,
					reason: 'x'
				})
			).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
			await expect(
				admin().users.grantProduct({
					userId: seeded.users.nobody.id,
					productId: crypto.randomUUID(),
					actorId: adminId,
					reason: 'x'
				})
			).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
		});

		it('suspends with a reason and audit, and refuses to suspend an admin', async () => {
			const { member } = seeded.users;
			const suspended = await admin().users.suspend({
				userId: member.id,
				reason: 'Chargeback',
				actorId: adminId
			});
			expect(suspended).toMatchObject({ is_suspended: true, suspended_reason: 'Chargeback' });
			expect(await auditRows('user.suspend')).toEqual([
				expect.objectContaining({ actor_id: adminId, entity: 'profile', entity_id: member.id })
			]);

			const refusal = await admin()
				.users.suspend({ userId: adminId, reason: 'no', actorId: adminId })
				.catch((err: unknown) => err);
			expect(refusal).toBeInstanceOf(DomainError);
			expect(refusal).toMatchObject({ code: 'USER_IS_ADMIN' });
		});

		it('setAdmin flips the flag with an audit row and refuses self-demotion', async () => {
			const { nobody } = seeded.users;
			const promoted = await admin().users.setAdmin({
				userId: nobody.id,
				isAdmin: true,
				actorId: adminId
			});
			expect(promoted.is_admin).toBe(true);
			const [entry] = await auditRows('user.set_admin');
			expect(entry).toMatchObject({
				actor_id: adminId,
				entity_id: nobody.id,
				before: { is_admin: false },
				after: { is_admin: true }
			});

			await expect(
				admin().users.setAdmin({ userId: adminId, isAdmin: false, actorId: adminId })
			).rejects.toMatchObject({ code: 'CANNOT_DEMOTE_SELF' });
			expect(await auditRows('user.set_admin')).toHaveLength(1);
		});

		it('sends a password reset through Better Auth and audits it', async () => {
			const { member } = seeded.users;
			await admin().users.sendReset({ userId: member.id, actorId: adminId });
			expect(seeded.services.resetEmails.map((mail) => mail.to)).toEqual([member.email]);
			expect(await auditRows('user.send_reset')).toEqual([
				expect.objectContaining({ actor_id: adminId, entity_id: member.id })
			]);
		});

		it('revokes every session of the user and records how many', async () => {
			const { member, nobody } = seeded.users;
			const expires = new Date(NOW.getTime() + 86_400_000);
			await db()
				.insert(sessions)
				.values([
					{ userId: member.id, token: 't1', expiresAt: expires },
					{ userId: member.id, token: 't2', expiresAt: expires },
					{ userId: nobody.id, token: 't3', expiresAt: expires }
				]);

			expect(await admin().users.revokeSessions({ userId: member.id, actorId: adminId })).toBe(2);
			expect(await db().select().from(sessions)).toHaveLength(1);
			const [entry] = await auditRows('user.revoke_sessions');
			expect(entry).toMatchObject({ actor_id: adminId, after: { sessions_revoked: 2 } });
		});

		it('detail lists orders, every entitlement with its source and grantor, progress and sessions', async () => {
			const { bundleOwner } = seeded.users;
			await admin().users.grantProduct({
				userId: bundleOwner.id,
				productId: seeded.single.id,
				actorId: adminId,
				reason: 'Apology'
			});
			await seedOrder(bundleOwner.id, 'paid', daysAgo(1), [[seeded.bundle.id, 'Bundle', 2900]]);

			const detail = await admin().users.detail(bundleOwner.id);
			if (!detail) throw new Error('expected a detail');
			expect(detail.profile.email).toBe(bundleOwner.email);
			expect(detail.orders).toHaveLength(1);
			expect(
				detail.entitlements.map((row) => [row.productId, row.source, row.grantedBy?.email ?? null])
			).toEqual(
				expect.arrayContaining([
					[seeded.single.id, 'admin_grant', 'owner@example.com'],
					[seeded.bundle.id, 'purchase', null]
				])
			);
			expect(detail.progress).toEqual({ started: 0, completed: 0, lastActivityAt: null });
			expect(detail.sessionCount).toBe(0);
			expect(detail.products.map((product) => product.id).sort()).toEqual(
				[seeded.flagship.id, seeded.bundle.id, seeded.single.id].sort()
			);

			expect(await admin().users.detail(crypto.randomUUID())).toBeNull();
		});
	});

	describe('orders', () => {
		/** A pending order for `nobody` with a Checkout Session started in the fake gateway. */
		async function checkoutOrder(productIds: string[]) {
			const { orders: orderService } = seeded.services.commerce;
			const { nobody } = seeded.users;
			const order = await orderService.createPendingOrder({
				userId: nobody.id,
				state: { items: productIds, promoCode: null },
				viewer: { id: nobody.id }
			});
			await orderService.startCheckout(order.id, { customerEmail: nobody.email });
			const stored = await orderService.getById(order.id);
			if (!stored?.stripe_checkout_session_id) throw new Error('no session');
			return { ...stored, sessionId: stored.stripe_checkout_session_id };
		}

		it('rerunFulfilment fulfils a pending order whose session is paid, then reports it as done', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			seeded.services.payments.markPaid(order.sessionId);

			expect(await admin().orders.rerunFulfilment(order.id, adminId)).toEqual({
				fulfilled: true,
				firstFulfilment: true
			});
			const [row] = await db().select().from(orders).where(eq(orders.id, order.id));
			expect(row.status).toBe('paid');
			expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual([
				seeded.bundle.id
			]);
			expect(await auditRows('order.rerun_fulfilment')).toEqual([
				expect.objectContaining({
					actor_id: adminId,
					entity: 'order',
					entity_id: order.id,
					before: { status: 'pending' },
					after: { status: 'paid' }
				})
			]);

			expect(await admin().orders.rerunFulfilment(order.id, adminId)).toEqual({
				alreadyFulfilled: true
			});
			expect(
				await db()
					.select()
					.from(entitlements)
					.where(eq(entitlements.user_id, seeded.users.nobody.id))
			).toHaveLength(1);
		});

		it('rerunFulfilment refuses an unpaid session and an order that never reached Stripe', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			await expect(admin().orders.rerunFulfilment(order.id, adminId)).rejects.toMatchObject({
				code: 'FULFILMENT_MISMATCH'
			});
			expect((await db().select().from(orders).where(eq(orders.id, order.id)))[0].status).toBe(
				'pending'
			);

			const offline = await seedOrder(seeded.users.nobody.id, 'pending', null, [
				[seeded.single.id, 'Single', 900]
			]);
			await expect(admin().orders.rerunFulfilment(offline, adminId)).rejects.toMatchObject({
				code: 'NO_CHECKOUT_SESSION'
			});
			await expect(
				admin().orders.rerunFulfilment(crypto.randomUUID(), adminId)
			).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
			expect(await auditRows('order.rerun_fulfilment')).toHaveLength(0);
		});

		it('addNote appends dated notes and audits each one', async () => {
			const orderId = await seedOrder(seeded.users.nobody.id, 'paid', daysAgo(1), [
				[seeded.single.id, 'Single', 900]
			]);
			const first = await admin().orders.addNote(orderId, 'Customer emailed', adminId);
			const second = await admin().orders.addNote(orderId, 'Resent receipt', adminId);

			expect(first).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} — Customer emailed$/);
			expect(second.split('\n\n')).toEqual([
				first,
				expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} — Resent receipt$/)
			]);
			const [row] = await db().select().from(orders).where(eq(orders.id, orderId));
			expect(row.admin_notes).toBe(second);

			const entries = await db()
				.select()
				.from(audit_log)
				.where(eq(audit_log.action, 'order.add_note'))
				.orderBy(audit_log.created_at);
			expect(
				entries.map((entry) => [entry.actor_id, entry.entity_id, entry.before, entry.after])
			).toEqual([
				[adminId, orderId, { admin_notes: null }, { admin_notes: first }],
				[adminId, orderId, { admin_notes: first }, { admin_notes: second }]
			]);

			await expect(admin().orders.addNote(crypto.randomUUID(), 'x', adminId)).rejects.toMatchObject(
				{ code: 'ORDER_NOT_FOUND' }
			);
		});

		it('lists orders filtered by status and searched by email or Stripe id', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			const paid = await seedOrder(seeded.users.member.id, 'paid', daysAgo(1), [
				[seeded.single.id, 'Single', 900]
			]);

			const pendingOnly = await admin().orders.list({ status: 'pending', page: 1 });
			expect(pendingOnly.rows.map((row) => row.id)).toEqual([order.id]);

			const paidOnly = await admin().orders.list({ status: 'paid', page: 1 });
			expect(paidOnly.rows.map((row) => [row.id, row.email, row.itemCount])).toEqual([
				[paid, 'member@example.com', 1]
			]);

			expect(
				(await admin().orders.list({ q: 'NOBODY@', page: 1 })).rows.map((row) => row.id)
			).toEqual([order.id]);
			expect(
				(await admin().orders.list({ q: order.sessionId, page: 1 })).rows.map((row) => row.id)
			).toEqual([order.id]);
			expect((await admin().orders.list({ q: paid, page: 1 })).rows.map((row) => row.id)).toEqual([
				paid
			]);
			expect((await admin().orders.list({ page: 1 })).total).toBe(2);
		});

		it('detail shows items with their access, the Stripe events about the order, and its audit trail', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			const { payments } = seeded.services;
			payments.markPaid(order.sessionId);
			const fulfilment = seeded.services.commerce.fulfilment;
			await fulfilment.handleGatewayEvent(
				await payments.constructEvent(
					payments.eventsFromSession(order.sessionId, 'checkout.session.completed'),
					'sig'
				)
			);
			await fulfilment.handleGatewayEvent(
				await payments.constructEvent(
					payments.eventsFromSession(order.sessionId, 'charge.refunded'),
					'sig'
				)
			);
			// Another order's delivery is not listed.
			const other = await checkoutOrder([seeded.flagship.id]);
			await fulfilment.handleGatewayEvent(
				await payments.constructEvent(
					payments.eventsFromSession(other.sessionId, 'checkout.session.expired'),
					'sig'
				)
			);
			await admin().orders.addNote(order.id, 'Refund requested by email', adminId);

			const detail = await admin().orders.detail(order.id);
			if (!detail) throw new Error('expected a detail');
			expect(detail.order.status).toBe('refunded');
			expect(detail.buyer).toEqual({
				id: seeded.users.nobody.id,
				email: seeded.users.nobody.email,
				fullName: 'Nobody'
			});
			expect(detail.items.map((item) => [item.productId, item.access])).toEqual(
				expect.arrayContaining([
					[seeded.bundle.id, 'revoked'],
					[seeded.single.id, 'revoked']
				])
			);
			expect(detail.events.map((event) => event.type)).toEqual([
				'checkout.session.completed',
				'charge.refunded'
			]);
			expect(detail.audit.map((entry) => [entry.action, entry.actor?.email])).toEqual([
				['order.add_note', 'owner@example.com']
			]);
			expect(detail.links.session).toBe(
				`https://dashboard.stripe.com/test/search?query=${order.sessionId}`
			);
			expect(detail.links.paymentIntent).toMatch(
				/^https:\/\/dashboard\.stripe\.com\/test\/payments\/pi_/
			);

			expect(await admin().orders.detail(crypto.randomUUID())).toBeNull();
		});

		it('stripeLinks uses the live dashboard for live ids and omits missing ones', () => {
			expect(
				stripeLinks({ sessionId: 'cs_live_123', paymentIntentId: 'pi_9', customerId: 'cus_1' })
			).toEqual({
				session: 'https://dashboard.stripe.com/search?query=cs_live_123',
				paymentIntent: 'https://dashboard.stripe.com/payments/pi_9',
				customer: 'https://dashboard.stripe.com/customers/cus_1'
			});
			expect(stripeLinks({ sessionId: null, paymentIntentId: null, customerId: null })).toEqual({
				session: null,
				paymentIntent: null,
				customer: null
			});
		});
	});

	describe('audit', () => {
		it('lists entries newest first, filtered by entity, entity id and actor', async () => {
			const { member, nobody } = seeded.users;
			await admin().users.suspend({ userId: member.id, reason: 'Spam', actorId: adminId });
			await admin().users.setAdmin({ userId: nobody.id, isAdmin: true, actorId: adminId });
			await admin().users.grantProduct({
				userId: member.id,
				productId: seeded.single.id,
				actorId: nobody.id,
				reason: 'Gift'
			});

			const all = await admin().audit.list({ page: 1 });
			expect(all.total).toBe(3);

			const profileRows = await admin().audit.list({ entity: 'profile', page: 1 });
			expect(profileRows.rows.map((row) => row.action).sort()).toEqual([
				'user.set_admin',
				'user.suspend'
			]);

			const forMember = await admin().audit.list({
				entity: 'profile',
				entityId: member.id,
				page: 1
			});
			expect(forMember.rows.map((row) => [row.action, row.actor?.email])).toEqual([
				['user.suspend', 'owner@example.com']
			]);

			const byNobody = await admin().audit.list({ actorId: nobody.id, page: 1 });
			expect(byNobody.rows.map((row) => row.action)).toEqual(['entitlement.grant']);
		});
	});
});
