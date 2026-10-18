import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '#lib/server/db/index.ts';
import type { CheckoutSessionView, GatewayEvent } from '#lib/server/platform/index.ts';
import type { PromoInput } from '#lib/shared/schemas/commerce.ts';
import { seedCatalog, type SeededCatalog } from '../../../../../tests/helpers/fixtures.ts';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { DomainError } from '../errors.ts';
import { proRata } from './fulfilment.ts';
import type { OrderWithItems } from './orders.ts';

const { orders, order_items, entitlements, profiles, users, webhook_events, promo_redemptions } =
	schema;

const CONFIRMATION_SUBJECT = "Your Purchase Confirmation - Skyler's Sewing Secrets";
const WELCOME_SUBJECT = "Welcome to Skyler's Sewing Secrets!";
const REVOKED_SUBJECT = "An update on your order - Skyler's Sewing Secrets";

const promoInput: PromoInput = {
	code: 'SAVE20',
	description: '',
	discountType: 'percentage',
	discountValue: 20,
	appliesTo: 'all',
	productIds: [],
	minSubtotal: null,
	maxRedemptions: null,
	maxRedemptionsPerUser: null,
	startsAt: null,
	endsAt: null,
	isActive: true,
	stackableWithSale: false
};

describe('createFulfilmentService', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
	});

	const service = () => seeded.services.commerce.fulfilment;
	const buyer = () => seeded.users.nobody;

	/** A pending order for `nobody` with a Checkout Session started for it. */
	async function checkoutOrder(
		productIds: string[],
		promoCode: string | null = null,
		userId = buyer().id
	): Promise<OrderWithItems & { sessionId: string }> {
		const { orders: orderService } = seeded.services.commerce;
		const order = await orderService.createPendingOrder({
			userId,
			state: { items: productIds, promoCode },
			viewer: { id: userId }
		});
		await orderService.startCheckout(order.id, { customerEmail: buyer().email });
		const stored = await orderService.getById(order.id);
		if (!stored?.stripe_checkout_session_id) throw new Error('no session');
		return { ...stored, sessionId: stored.stripe_checkout_session_id };
	}

	/** Pays the session in the fake gateway and fulfils the order with the result. */
	async function payAndFulfil(
		order: OrderWithItems & { sessionId: string },
		overrides: Partial<CheckoutSessionView> = {}
	) {
		const session = seeded.services.payments.markPaid(order.sessionId, overrides);
		return { session, result: await service().fulfilOrder(order.id, session) };
	}

	const activeEntitlements = (userId: string) =>
		db()
			.select()
			.from(entitlements)
			.where(eq(entitlements.user_id, userId))
			.then((rows) => rows.filter((row) => row.revoked_at === null));

	const orderRow = async (id: string) =>
		(await db().select().from(orders).where(eq(orders.id, id)))[0];

	const subjects = () => seeded.services.mailer.sent.map((mail) => mail.subject);

	function gatewayEvent(
		sessionId: string,
		type: Parameters<typeof seeded.services.payments.eventsFromSession>[1]
	) {
		return seeded.services.payments.constructEvent(
			seeded.services.payments.eventsFromSession(sessionId, type),
			'sig'
		);
	}

	describe('fulfilOrder', () => {
		it('grants one purchase entitlement per item, marks the order paid and stores the Stripe ids', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			const { session, result } = await payAndFulfil(order);

			expect(result).toEqual({ fulfilled: true, firstFulfilment: true });
			const granted = await activeEntitlements(buyer().id);
			expect(granted).toHaveLength(2);
			expect(granted.map((row) => row.source)).toEqual(['purchase', 'purchase']);
			expect(new Set(granted.map((row) => row.order_item_id))).toEqual(
				new Set(order.items.map((item) => item.id))
			);
			expect(new Set(granted.map((row) => row.product_id))).toEqual(
				new Set([seeded.bundle.id, seeded.single.id])
			);

			const paid = await orderRow(order.id);
			expect(paid.status).toBe('paid');
			expect(paid.paid_at).not.toBeNull();
			expect(paid.stripe_payment_intent_id).toBe(session.paymentIntentId);
			const [profile] = await db().select().from(profiles).where(eq(profiles.id, buyer().id));
			expect(profile.stripe_customer_id).toBe(session.customerId);
			expect(await seeded.services.entitlements.ownedProductIds(buyer().id)).toHaveLength(2);
		});

		it('is idempotent: a second call grants nothing new and no second confirmation goes out', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			const { session } = await payAndFulfil(order);
			expect(await service().fulfilOrder(order.id, session)).toEqual({ alreadyFulfilled: true });

			expect(await activeEntitlements(buyer().id)).toHaveLength(2);
			expect(
				await db().select().from(entitlements).where(eq(entitlements.user_id, buyer().id))
			).toHaveLength(2);
			expect(subjects().filter((subject) => subject === CONFIRMATION_SUBJECT)).toHaveLength(1);
			expect(subjects()).toHaveLength(2);
		});

		it('refuses a session whose total, reference or currency do not match and writes nothing', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			const before = seeded.services.mailer.sent.length;

			for (const overrides of [
				{ amountTotal: order.total - 100 },
				{ clientReferenceId: crypto.randomUUID() },
				{ currency: 'usd' },
				{ paymentStatus: 'unpaid' as const }
			]) {
				const session = seeded.services.payments.markPaid(order.sessionId, overrides);
				await expect(service().fulfilOrder(order.id, session)).rejects.toMatchObject({
					name: 'DomainError',
					code: 'FULFILMENT_MISMATCH'
				});
			}

			const row = await orderRow(order.id);
			expect(row.status).toBe('pending');
			expect(row.paid_at).toBeNull();
			expect(row.stripe_payment_intent_id).toBeNull();
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);
			expect(seeded.services.mailer.sent).toHaveLength(before);
		});

		it('throws for an unknown order', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			const session = seeded.services.payments.markPaid(order.sessionId);
			await expect(service().fulfilOrder(crypto.randomUUID(), session)).rejects.toBeInstanceOf(
				DomainError
			);
		});

		it('verifies the email only when Stripe confirms the account address', async () => {
			const verified = async () =>
				(await db().select().from(users).where(eq(users.id, buyer().id)))[0].emailVerified;
			expect(await verified()).toBe(false);

			const first = await checkoutOrder([seeded.bundle.id]);
			await payAndFulfil(first, { customerEmail: 'someone-else@example.com' });
			expect(await verified()).toBe(false);

			const second = await checkoutOrder([seeded.single.id]);
			await payAndFulfil(second, { customerEmail: 'NOBODY@Example.com' });
			expect(await verified()).toBe(true);
		});

		it('sends welcome and confirmation for the first order, only the confirmation afterwards', async () => {
			const first = await checkoutOrder([seeded.bundle.id]);
			expect((await payAndFulfil(first)).result).toEqual({
				fulfilled: true,
				firstFulfilment: true
			});
			expect(subjects()).toEqual([CONFIRMATION_SUBJECT, WELCOME_SUBJECT]);
			const confirmation = seeded.services.mailer.sent[0];
			expect(confirmation.to).toBe(buyer().email);
			expect(confirmation.text).toContain('basics-bundle');
			expect(confirmation.text).toContain('£29.00');
			expect(seeded.services.mailer.sent[1].text).toContain('http://localhost:5173/library');

			const second = await checkoutOrder([seeded.single.id]);
			expect((await payAndFulfil(second)).result).toEqual({
				fulfilled: true,
				firstFulfilment: false
			});
			expect(subjects()).toEqual([CONFIRMATION_SUBJECT, WELCOME_SUBJECT, CONFIRMATION_SUBJECT]);
		});

		it('logs a failed email instead of throwing, after the grant is committed', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			const session = seeded.services.payments.markPaid(order.sessionId);
			const original = seeded.services.mailer.send;
			seeded.services.mailer.send = async () => {
				throw new Error('resend down');
			};
			try {
				expect(await service().fulfilOrder(order.id, session)).toEqual({
					fulfilled: true,
					firstFulfilment: true
				});
			} finally {
				seeded.services.mailer.send = original;
			}
			expect((await orderRow(order.id)).status).toBe('paid');
			expect(await activeEntitlements(buyer().id)).toHaveLength(1);
			const failures = seeded.services.logEntries.filter((entry) => entry.level === 'error');
			expect(failures.map((entry) => entry.message)).toEqual([
				'order confirmation email failed',
				'welcome email failed'
			]);
			expect(JSON.stringify(failures)).not.toContain(buyer().email);
		});
	});

	describe('revokeOrder', () => {
		it('a full refund revokes every entitlement, sets refunded and refunds each item in full', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			await payAndFulfil(order);

			const result = await service().revokeOrder(order.id, { kind: 'refund' });
			expect(result).toEqual({ status: 'refunded', revoked: 2 });
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);
			expect(await seeded.services.entitlements.ownedProductIds(buyer().id)).toEqual([]);
			const revoked = await db()
				.select()
				.from(entitlements)
				.where(eq(entitlements.user_id, buyer().id));
			expect(revoked.map((row) => row.revoke_reason)).toEqual(['refund', 'refund']);
			expect((await orderRow(order.id)).status).toBe('refunded');
			const items = await db().select().from(order_items).where(eq(order_items.order_id, order.id));
			expect(items.map((item) => item.refunded_amount)).toEqual([2900, 900]);

			const mail = seeded.services.mailer.sent.at(-1);
			expect(mail?.subject).toBe(REVOKED_SUBJECT);
			expect(mail?.to).toBe(buyer().email);
			expect(mail?.text).toContain(order.id);
		});

		it('a partial refund still revokes everything and spreads the amount pro rata', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			await payAndFulfil(order);

			const result = await service().revokeOrder(order.id, {
				kind: 'partial_refund',
				amountRefunded: 1001
			});
			expect(result).toEqual({ status: 'partially_refunded', revoked: 2 });
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);
			expect((await orderRow(order.id)).status).toBe('partially_refunded');
			const items = await db().select().from(order_items).where(eq(order_items.order_id, order.id));
			// 2900 + 900 = 3800; 1001 splits 763 / 237 with the rounding penny on the last line.
			expect(items.map((item) => item.refunded_amount)).toEqual([763, 238]);
			expect(subjects().at(-1)).toBe(REVOKED_SUBJECT);
		});

		it('a dispute revokes access and marks the order disputed without recording a refund', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			await payAndFulfil(order);

			expect(await service().revokeOrder(order.id, { kind: 'dispute' })).toEqual({
				status: 'disputed',
				revoked: 1
			});
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);
			expect((await orderRow(order.id)).status).toBe('disputed');
			const items = await db().select().from(order_items).where(eq(order_items.order_id, order.id));
			expect(items.map((item) => item.refunded_amount)).toEqual([0]);
		});

		it('proRata hands the rounding remainder to the last item', () => {
			expect(
				proRata([{ unit_price: 2900 }, { unit_price: 2900 }, { unit_price: 1000 }], 1000)
			).toEqual([426, 426, 148]);
			expect(proRata([{ unit_price: 2900 }], 2900)).toEqual([2900]);
			expect(proRata([], 100)).toEqual([]);
		});
	});

	describe('handleGatewayEvent', () => {
		const eventRows = () => db().select().from(webhook_events);

		it('fulfils on checkout.session.completed and treats a redelivery as a duplicate', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			seeded.services.payments.markPaid(order.sessionId);
			const event = await gatewayEvent(order.sessionId, 'checkout.session.completed');

			expect(await service().handleGatewayEvent(event)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('paid');
			expect(await activeEntitlements(buyer().id)).toHaveLength(2);

			expect(await service().handleGatewayEvent(event)).toEqual({ duplicate: true });
			expect(await activeEntitlements(buyer().id)).toHaveLength(2);
			expect(subjects().filter((subject) => subject === CONFIRMATION_SUBJECT)).toHaveLength(1);

			const rows = await eventRows();
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				provider: 'stripe',
				event_id: event.id,
				type: 'checkout.session.completed',
				reference: order.sessionId,
				error: null
			});
			expect(rows[0].processed_at).not.toBeNull();
		});

		it('ignores an unpaid checkout.session.completed (delayed payment) and fulfils on async_payment_succeeded', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			const unpaid = await gatewayEvent(order.sessionId, 'checkout.session.completed');
			expect(await service().handleGatewayEvent(unpaid)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('pending');
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);

			seeded.services.payments.markPaid(order.sessionId);
			const succeeded = await gatewayEvent(
				order.sessionId,
				'checkout.session.async_payment_succeeded'
			);
			expect(await service().handleGatewayEvent(succeeded)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('paid');
			expect(await activeEntitlements(buyer().id)).toHaveLength(1);
		});

		it('records an unknown order on the event row and returns normally', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			const base = await gatewayEvent(order.sessionId, 'checkout.session.completed');
			const event: GatewayEvent = {
				...base,
				type: 'checkout.session.completed',
				data: {
					...(base.data as CheckoutSessionView),
					clientReferenceId: crypto.randomUUID(),
					metadata: {}
				}
			};

			const result = await service().handleGatewayEvent(event);
			expect(result).toMatchObject({ duplicate: false, processed: false });
			const [row] = await eventRows();
			expect(row.error).toMatch(/order not found/);
			expect(row.processed_at).toBeNull();
			expect((await orderRow(order.id)).status).toBe('pending');
		});

		it('async_payment_failed expires the order and releases its promo redemption', async () => {
			await seeded.services.commerce.promo.create(promoInput);
			const order = await checkoutOrder([seeded.bundle.id], 'SAVE20');
			expect(order.promoCode).toBe('SAVE20');
			expect(await db().select().from(promo_redemptions)).toHaveLength(1);

			const event = await gatewayEvent(order.sessionId, 'checkout.session.async_payment_failed');
			expect(await service().handleGatewayEvent(event)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('expired');
			expect(await db().select().from(promo_redemptions)).toHaveLength(0);
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);
		});

		it('checkout.session.expired expires a pending order and leaves a paid one alone', async () => {
			const pending = await checkoutOrder([seeded.bundle.id]);
			const event = await gatewayEvent(pending.sessionId, 'checkout.session.expired');
			await service().handleGatewayEvent(event);
			expect((await orderRow(pending.id)).status).toBe('expired');

			const paid = await checkoutOrder([seeded.single.id]);
			await payAndFulfil(paid);
			const late = await gatewayEvent(paid.sessionId, 'checkout.session.expired');
			expect(await service().handleGatewayEvent(late)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(paid.id)).status).toBe('paid');
			expect(await activeEntitlements(buyer().id)).toHaveLength(1);
		});

		it('charge.refunded revokes access: fully when the whole amount is refunded, partially otherwise', async () => {
			const order = await checkoutOrder([seeded.bundle.id, seeded.single.id]);
			await payAndFulfil(order);

			const partialBody = JSON.parse(
				seeded.services.payments.eventsFromSession(order.sessionId, 'charge.refunded')
			) as { data: { object: { amount_refunded: number; refunded: boolean } } };
			partialBody.data.object.amount_refunded = 1000;
			partialBody.data.object.refunded = false;
			const partial = await seeded.services.payments.constructEvent(
				JSON.stringify(partialBody),
				'sig'
			);
			expect(await service().handleGatewayEvent(partial)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('partially_refunded');
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);

			const full = await gatewayEvent(order.sessionId, 'charge.refunded');
			expect(await service().handleGatewayEvent(full)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('refunded');
			const items = await db().select().from(order_items).where(eq(order_items.order_id, order.id));
			expect(items.map((item) => item.refunded_amount)).toEqual([2900, 900]);
		});

		it('charge.dispute.created revokes access and marks the order disputed', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			await payAndFulfil(order);

			const event = await gatewayEvent(order.sessionId, 'charge.dispute.created');
			expect(await service().handleGatewayEvent(event)).toEqual({
				duplicate: false,
				processed: true
			});
			expect((await orderRow(order.id)).status).toBe('disputed');
			expect(await activeEntitlements(buyer().id)).toHaveLength(0);
			expect(subjects().at(-1)).toBe(REVOKED_SUBJECT);
		});

		it('records an unmatched charge on the event row', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			seeded.services.payments.markPaid(order.sessionId);
			// Never fulfilled: no order carries this payment intent.
			const event = await gatewayEvent(order.sessionId, 'charge.refunded');
			expect(await service().handleGatewayEvent(event)).toMatchObject({
				duplicate: false,
				processed: false,
				error: expect.stringMatching(/order not found/) as string
			});
			expect((await orderRow(order.id)).status).toBe('pending');
		});

		it('records a handler failure, rethrows, and lets the provider retry the same event id', async () => {
			const order = await checkoutOrder([seeded.bundle.id]);
			// Paid for a different total than the order: fulfilment refuses it.
			seeded.services.payments.markPaid(order.sessionId, { amountTotal: order.total + 1 });
			const event = await gatewayEvent(order.sessionId, 'checkout.session.completed');

			await expect(service().handleGatewayEvent(event)).rejects.toMatchObject({
				code: 'FULFILMENT_MISMATCH'
			});
			let [row] = await eventRows();
			expect(row.error).toMatch(/FULFILMENT_MISMATCH|does not match/);
			expect(row.processed_at).toBeNull();
			expect((await orderRow(order.id)).status).toBe('pending');

			// Stripe retries after a 500: the session now reports the right total.
			seeded.services.payments.markPaid(order.sessionId, { amountTotal: order.total });
			const retry: GatewayEvent = {
				...event,
				type: 'checkout.session.completed',
				data: { ...(event.data as CheckoutSessionView), amountTotal: order.total }
			};
			expect(await service().handleGatewayEvent(retry)).toEqual({
				duplicate: false,
				processed: true
			});
			[row] = await eventRows();
			expect(row.error).toBeNull();
			expect(row.processed_at).not.toBeNull();
			expect((await orderRow(order.id)).status).toBe('paid');
		});

		it('stores an unhandled Stripe type as processed without side effects', async () => {
			const event = await seeded.services.payments.constructEvent(
				JSON.stringify({ id: 'evt_other', type: 'payment_intent.created', data: { object: {} } }),
				'sig'
			);
			expect(await service().handleGatewayEvent(event)).toEqual({
				duplicate: false,
				processed: true
			});
			expect(await eventRows()).toMatchObject([
				{ event_id: 'evt_other', type: 'payment_intent.created', error: null }
			]);
		});
	});
});
