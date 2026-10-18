import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { schema } from '#lib/server/db/index.ts';
import type { PromoInput } from '#lib/shared/schemas/commerce.ts';
import { seedCatalog, type SeededCatalog } from '../../../../../tests/helpers/fixtures.ts';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { TEST_SITE_URL } from '../../../../../tests/helpers/services.ts';
import type { CartState } from './cart.ts';
import { createOrderService, EmptyCartError, ORDER_TTL_MS, PromoInvalidError } from './orders.ts';
import type { PromoService } from './promo.ts';

const { orders, order_items, promo_redemptions } = schema;

const T0 = new Date('2026-10-18T10:00:00.000Z');

function promoInput(overrides: Partial<PromoInput> & Pick<PromoInput, 'code'>): PromoInput {
	return {
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
		stackableWithSale: false,
		...overrides
	};
}

describe('createOrderService', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let clock: Date;

	/** The seeded services' order service, on a clock the test controls. */
	function service(promoOverride: Partial<PromoService> = {}) {
		const { commerce, catalog, payments, logger } = seeded.services;
		return createOrderService({
			db: db(),
			cart: commerce.cart,
			promo: { ...commerce.promo, ...promoOverride },
			catalog,
			gateway: payments,
			log: logger,
			siteUrl: TEST_SITE_URL,
			now: () => clock
		});
	}

	const cart = (items: string[], promoCode: string | null = null): CartState => ({
		items,
		promoCode
	});

	async function pendingOrder(userId: string, state: CartState) {
		return service().createPendingOrder({ userId, state, viewer: { id: userId } });
	}

	async function rowsFor(userId: string) {
		const orderRows = await db().select().from(orders).where(eq(orders.user_id, userId));
		const itemRows = await db().select().from(order_items);
		const redemptions = await db()
			.select()
			.from(promo_redemptions)
			.where(eq(promo_redemptions.user_id, userId));
		return { orderRows, itemRows, redemptions };
	}

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		clock = T0;
	});

	describe('createPendingOrder', () => {
		it('snapshots the quoted prices, sets a one-hour expiry and reserves the redemption', async () => {
			const buyer = seeded.users.nobody.id;
			await seeded.services.commerce.promo.create(promoInput({ code: 'SAVE20' }));

			const order = await pendingOrder(buyer, cart([seeded.bundle.id, seeded.single.id], 'SAVE20'));

			expect(order.status).toBe('pending');
			expect(order.user_id).toBe(buyer);
			expect(order.currency).toBe('gbp');
			// bundle 2900 and single 900, 20% off each line.
			expect(order.subtotal).toBe(3800);
			expect(order.discount_total).toBe(760);
			expect(order.total).toBe(3040);
			expect(order.promoCode).toBe('SAVE20');
			expect(order.stripe_checkout_session_id).toBeNull();
			expect(Date.parse(order.expires_at ?? '')).toBe(T0.getTime() + ORDER_TTL_MS);

			expect(
				order.items.map((item) => [
					item.product_title,
					item.list_price,
					item.unit_price,
					item.discount_amount
				])
			).toEqual([
				['basics-bundle', 2900, 2320, 580],
				['standalone-video', 900, 720, 180]
			]);

			const { orderRows, itemRows, redemptions } = await rowsFor(buyer);
			expect(orderRows).toHaveLength(1);
			expect(orderRows[0].promo_code_id).not.toBeNull();
			expect(itemRows.map((item) => item.order_id)).toEqual([order.id, order.id]);
			expect(redemptions).toHaveLength(1);
			expect(redemptions[0]).toMatchObject({
				order_id: order.id,
				promo_code_id: orderRows[0].promo_code_id,
				discount_total: 760
			});
		});

		it('is atomic: a failure after the inserts leaves no orders, order_items or promo_redemptions rows', async () => {
			const buyer = seeded.users.nobody.id;
			await seeded.services.commerce.promo.create(promoInput({ code: 'SAVE20' }));
			const failing = service({
				reserveRedemption: async () => {
					throw new Error('forced failure after the order insert');
				}
			});

			await expect(
				failing.createPendingOrder({
					userId: buyer,
					state: cart([seeded.bundle.id], 'SAVE20'),
					viewer: { id: buyer }
				})
			).rejects.toThrow('forced failure after the order insert');

			const { orderRows, itemRows, redemptions } = await rowsFor(buyer);
			expect(orderRows).toEqual([]);
			expect(itemRows).toEqual([]);
			expect(redemptions).toEqual([]);
			expect(await db().select().from(orders)).toEqual([]);
		});

		it('refuses an empty cart, including one emptied by ownership', async () => {
			await expect(pendingOrder(seeded.users.nobody.id, cart([]))).rejects.toBeInstanceOf(
				EmptyCartError
			);
			// The member owns the course, so every product resolves away.
			await expect(
				pendingOrder(seeded.users.member.id, cart([seeded.bundle.id, seeded.single.id]))
			).rejects.toMatchObject({ code: 'EMPTY_CART' });
			expect(await db().select().from(orders)).toEqual([]);
		});

		it('refuses a cart whose code is rejected, with the reason', async () => {
			const result = pendingOrder(seeded.users.nobody.id, cart([seeded.bundle.id], 'NOPE'));
			await expect(result).rejects.toBeInstanceOf(PromoInvalidError);
			await expect(result).rejects.toMatchObject({ code: 'PROMO_INVALID', reason: 'not_found' });
			expect(await db().select().from(orders)).toEqual([]);
		});

		it('records no code when none is in the cart', async () => {
			const order = await pendingOrder(seeded.users.nobody.id, cart([seeded.single.id]));
			expect(order.promo_code_id).toBeNull();
			expect(order.promoCode).toBeNull();
			expect(order.total).toBe(900);
			expect(await db().select().from(promo_redemptions)).toEqual([]);
		});
	});

	describe('startCheckout', () => {
		it('creates the session keyed by the order id, with metadata.order_id, and stores the session id', async () => {
			const buyer = seeded.users.nobody;
			await seeded.services.commerce.promo.create(promoInput({ code: 'SAVE20' }));
			const order = await pendingOrder(
				buyer.id,
				cart([seeded.bundle.id, seeded.single.id], 'SAVE20')
			);

			const url = await service().startCheckout(order.id, { customerEmail: buyer.email });

			const { payments } = seeded.services;
			expect(payments.sessions.size).toBe(1);
			const [sessionId, stored] = [...payments.sessions.entries()][0];
			expect(url).toBe(`https://fake.stripe/${sessionId}`);
			// The real adapter sends `orderId` as the Stripe idempotency key.
			expect(stored.input.orderId).toBe(order.id);
			expect(stored.input.metadata).toEqual({ order_id: order.id });
			expect(stored.input.customerEmail).toBe(buyer.email);
			expect(stored.input.successUrl).toBe(
				`${TEST_SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
			);
			expect(stored.input.cancelUrl).toBe(`${TEST_SITE_URL}/checkout/cancel?order=${order.id}`);
			expect(stored.input.expiresAt.toISOString()).toBe(
				new Date(order.expires_at ?? '').toISOString()
			);
			expect(stored.input.lineItems).toEqual([
				{
					name: 'basics-bundle',
					unitAmount: 2320,
					quantity: 1,
					description: 'Promo SAVE20 applied (−£5.80)'
				},
				{
					name: 'standalone-video',
					unitAmount: 720,
					quantity: 1,
					description: 'Promo SAVE20 applied (−£1.80)'
				}
			]);
			expect(stored.session.client_reference_id).toBe(order.id);

			const stored2 = await service().getById(order.id);
			expect(stored2?.stripe_checkout_session_id).toBe(sessionId);
			expect(await service().getByCheckoutSession(sessionId)).toMatchObject({ id: order.id });
		});

		it('is idempotent: a second call returns the stored session URL without creating another', async () => {
			const buyer = seeded.users.nobody;
			const order = await pendingOrder(buyer.id, cart([seeded.single.id]));
			const first = await service().startCheckout(order.id, { customerEmail: buyer.email });
			const second = await service().startCheckout(order.id, { customerEmail: buyer.email });
			expect(second).toBe(first);
			expect(seeded.services.payments.sessions.size).toBe(1);
			const stored = [...seeded.services.payments.sessions.values()][0];
			expect(stored.input.lineItems).toEqual([
				{ name: 'standalone-video', unitAmount: 900, quantity: 1 }
			]);
		});

		it('refuses an order that is not pending and has no session', async () => {
			const buyer = seeded.users.nobody;
			const order = await pendingOrder(buyer.id, cart([seeded.single.id]));
			expect(await service().expire(order.id)).toBe(true);
			await expect(
				service().startCheckout(order.id, { customerEmail: buyer.email })
			).rejects.toMatchObject({ code: 'ORDER_NOT_PENDING' });
			await expect(
				service().startCheckout(crypto.randomUUID(), { customerEmail: buyer.email })
			).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
			expect(seeded.services.payments.sessions.size).toBe(0);
		});
	});

	describe('expire / expireStale / cancelPending', () => {
		it('expire releases the redemption from pending and refuses from paid', async () => {
			const buyer = seeded.users.nobody.id;
			await seeded.services.commerce.promo.create(promoInput({ code: 'SAVE20' }));
			const pending = await pendingOrder(buyer, cart([seeded.bundle.id], 'SAVE20'));
			const paid = await pendingOrder(buyer, cart([seeded.single.id], 'SAVE20'));
			await db().update(orders).set({ status: 'paid' }).where(eq(orders.id, paid.id));
			expect(await db().select().from(promo_redemptions)).toHaveLength(2);

			expect(await service().expire(pending.id)).toBe(true);
			expect((await service().getById(pending.id))?.status).toBe('expired');
			// Already expired: nothing to do.
			expect(await service().expire(pending.id)).toBe(false);

			expect(await service().expire(paid.id)).toBe(false);
			expect((await service().getById(paid.id))?.status).toBe('paid');

			const redemptions = await db().select().from(promo_redemptions);
			expect(redemptions.map((row) => row.order_id)).toEqual([paid.id]);
		});

		it('expireStale expires only pending orders past expires_at and releases their codes', async () => {
			const buyer = seeded.users.nobody.id;
			await seeded.services.commerce.promo.create(promoInput({ code: 'SAVE20' }));
			const early = await pendingOrder(buyer, cart([seeded.bundle.id], 'SAVE20'));
			const paidButOld = await pendingOrder(buyer, cart([seeded.single.id], 'SAVE20'));
			await db().update(orders).set({ status: 'paid' }).where(eq(orders.id, paidButOld.id));
			clock = new Date(T0.getTime() + 30 * 60 * 1000);
			const late = await pendingOrder(buyer, cart([seeded.bundle.id]));

			// One minute after `early` expired; `late` has half an hour left.
			const expired = await service().expireStale(new Date(T0.getTime() + ORDER_TTL_MS + 60_000));

			expect(expired).toEqual([early.id]);
			expect((await service().getById(early.id))?.status).toBe('expired');
			expect((await service().getById(late.id))?.status).toBe('pending');
			expect((await service().getById(paidButOld.id))?.status).toBe('paid');
			const redemptions = await db().select().from(promo_redemptions);
			expect(redemptions.map((row) => row.order_id)).toEqual([paidButOld.id]);

			// Nothing left to expire at that instant.
			expect(await service().expireStale(new Date(T0.getTime() + ORDER_TTL_MS + 60_000))).toEqual(
				[]
			);
		});

		it('cancelPending expires the buyer’s own pending order only', async () => {
			const buyer = seeded.users.nobody.id;
			const other = seeded.users.bundleOwner.id;
			const order = await pendingOrder(buyer, cart([seeded.single.id]));

			expect(await service().cancelPending(order.id, other)).toBe(false);
			expect((await service().getById(order.id))?.status).toBe('pending');
			expect(await service().cancelPending(order.id, buyer)).toBe(true);
			expect((await service().getById(order.id))?.status).toBe('expired');
			expect(await service().cancelPending(order.id, buyer)).toBe(false);
		});
	});

	describe('reads', () => {
		it('listForUser returns the buyer’s orders newest first, with items', async () => {
			const buyer = seeded.users.nobody.id;
			const first = await pendingOrder(buyer, cart([seeded.single.id]));
			clock = new Date(T0.getTime() + 60_000);
			const second = await pendingOrder(buyer, cart([seeded.bundle.id]));
			await pendingOrder(seeded.users.bundleOwner.id, cart([seeded.single.id]));

			const list = await service().listForUser(buyer);
			expect(list.map((order) => order.id)).toEqual([second.id, first.id]);
			expect(list[0].items.map((item) => item.product_title)).toEqual(['basics-bundle']);
			expect(list[1].items.map((item) => item.product_title)).toEqual(['standalone-video']);
			expect(await service().getById(crypto.randomUUID())).toBeNull();
			expect(await service().getByCheckoutSession('cs_missing')).toBeNull();
		});

		it('ownerOf and summaryForSuccessPage', async () => {
			const buyer = seeded.users.nobody.id;
			await seeded.services.commerce.promo.create(promoInput({ code: 'SAVE20' }));
			const order = await pendingOrder(buyer, cart([seeded.bundle.id], 'SAVE20'));

			const svc = service();
			expect(svc.ownerOf(order, { id: buyer })).toBe(true);
			expect(svc.ownerOf(order, { id: seeded.users.member.id })).toBe(false);
			expect(svc.ownerOf(order, null)).toBe(false);

			expect(await svc.summaryForSuccessPage(order)).toEqual({
				id: order.id,
				status: 'pending',
				subtotal: 2900,
				discountTotal: 580,
				total: 2320,
				promoCode: 'SAVE20',
				paidAt: null,
				items: [
					{
						productId: seeded.bundle.id,
						title: 'basics-bundle',
						listPrice: 2900,
						unitPrice: 2320,
						discount: 580,
						href: '/products/basics-bundle'
					}
				]
			});
		});
	});
});
