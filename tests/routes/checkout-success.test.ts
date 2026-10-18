import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CART_COOKIE_NAME,
	parseCart,
	serializeCart,
	type CartState,
	type OrderSummary,
	type OrderWithItems
} from '../../src/lib/server/modules/commerce/index.ts';
import { load as cancelLoad } from '../../src/routes/(shop)/checkout/cancel/+page.server.ts';
import { load } from '../../src/routes/(shop)/checkout/success/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { TEST_AUTH_SECRET } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type LoadEvent = Parameters<typeof load>[0];
type CancelLoadEvent = Parameters<typeof cancelLoad>[0];
interface SuccessData {
	summary: OrderSummary;
	paid: boolean;
	signedIn: boolean;
}

describe('/checkout/success and /checkout/cancel', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let order: OrderWithItems;
	let sessionId: string;

	const cartState: CartState = { items: [], promoCode: null };

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		const buyer = seeded.users.nobody;
		cartState.items = [seeded.bundle.id];
		order = await seeded.services.commerce.orders.createPendingOrder({
			userId: buyer.id,
			state: cartState,
			viewer: { id: buyer.id }
		});
		await seeded.services.commerce.orders.startCheckout(order.id, { customerEmail: buyer.email });
		const stored = await seeded.services.commerce.orders.getById(order.id);
		sessionId = stored?.stripe_checkout_session_id ?? '';
		expect(sessionId).toMatch(/^cs_test_fake_/);
	});

	async function successEvent(userId: string | null, query: string) {
		return memberEvent(seeded.services, userId, {
			url: `/checkout/success${query}`,
			headers: {
				cookie: `${CART_COOKIE_NAME}=${serializeCart(cartState, TEST_AUTH_SECRET)}`
			}
		});
	}

	function run(event: Awaited<ReturnType<typeof successEvent>>) {
		return outcome(async () => (await load(event as unknown as LoadEvent)) as SuccessData);
	}

	describe('success', () => {
		it('refuses a session that belongs to another signed-in user with 403', async () => {
			seeded.services.payments.markPaid(sessionId);
			const event = await successEvent(seeded.users.bundleOwner.id, `?session_id=${sessionId}`);
			expect(await run(event)).toBe('error 403');
			// The intruder's cart is left alone.
			expect(event.setCookies.filter((call) => call.name === CART_COOKIE_NAME)).toEqual([]);
		});

		it('shows the owner a paid session’s summary and clears the cart cookie', async () => {
			seeded.services.payments.markPaid(sessionId);
			const event = await successEvent(seeded.users.nobody.id, `?session_id=${sessionId}`);
			const result = await run(event);
			if (typeof result === 'string') throw new Error(result);

			expect(result.paid).toBe(true);
			expect(result.signedIn).toBe(true);
			// The page fulfils a paid session itself; the webhook finds it done.
			expect(result.summary).toMatchObject({
				id: order.id,
				status: 'paid',
				total: 2900,
				promoCode: null,
				items: [{ title: 'basics-bundle', unitPrice: 2900, href: '/products/basics-bundle' }]
			});
			expect(result.summary.paidAt).not.toBeNull();
			expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual([
				seeded.bundle.id
			]);

			const written = event.setCookies.filter((call) => call.name === CART_COOKIE_NAME);
			expect(written).toHaveLength(1);
			expect(parseCart(written[0].value, TEST_AUTH_SECRET)).toEqual({ items: [], promoCode: null });
			expect(written[0].options).toMatchObject({ httpOnly: true, path: '/', sameSite: 'lax' });
		});

		it('fulfils a paid order once across the page and the webhook', async () => {
			const session = seeded.services.payments.markPaid(sessionId);
			await seeded.services.commerce.fulfilment.fulfilOrder(order.id, session);
			const sentBefore = seeded.services.mailer.sent.length;

			const result = await run(
				await successEvent(seeded.users.nobody.id, `?session_id=${sessionId}`)
			);
			if (typeof result === 'string') throw new Error(result);
			expect(result.summary.status).toBe('paid');
			expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual([
				seeded.bundle.id
			]);
			expect(seeded.services.mailer.sent).toHaveLength(sentBefore);
		});

		it('still renders the finalising state when fulfilment fails, and logs it', async () => {
			// Stripe reports a different total than the order: fulfilment refuses it.
			seeded.services.payments.markPaid(sessionId, { amountTotal: 100 });
			const event = await successEvent(seeded.users.nobody.id, `?session_id=${sessionId}`);
			const result = await run(event);
			if (typeof result === 'string') throw new Error(result);
			expect(result.paid).toBe(true);
			expect(result.summary.status).toBe('pending');
			expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual(
				[]
			);
			const failures = seeded.services.logEntries.filter((entry) => entry.level === 'error');
			expect(failures.map((entry) => entry.message)).toEqual([
				'fulfilment from success page failed'
			]);
			expect(event.setCookies.filter((call) => call.name === CART_COOKIE_NAME)).toHaveLength(1);
		});

		it('leaves the cart alone and reports unpaid when Stripe has not been paid', async () => {
			const event = await successEvent(seeded.users.nobody.id, `?session_id=${sessionId}`);
			const result = await run(event);
			if (typeof result === 'string') throw new Error(result);
			expect(result.paid).toBe(false);
			expect(result.summary.status).toBe('pending');
			expect(event.setCookies.filter((call) => call.name === CART_COOKIE_NAME)).toEqual([]);
		});

		it('lets a signed-out visitor see their paid order without touching ownership', async () => {
			seeded.services.payments.markPaid(sessionId);
			const event = await successEvent(null, `?session_id=${sessionId}`);
			const result = await run(event);
			if (typeof result === 'string') throw new Error(result);
			expect(result.paid).toBe(true);
			expect(result.signedIn).toBe(false);
			expect(result.summary.id).toBe(order.id);
			expect(result.summary.status).toBe('paid');
		});

		it('sends a missing or unknown session back to the cart', async () => {
			expect(await run(await successEvent(null, ''))).toBe('redirect 303 /cart');
			expect(await run(await successEvent(null, '?session_id=cs_test_unknown'))).toBe(
				'redirect 303 /cart'
			);
		});
	});

	describe('cancel', () => {
		async function cancel(userId: string | null, query: string) {
			const event = await memberEvent(seeded.services, userId, { url: `/checkout/cancel${query}` });
			return cancelLoad(event as unknown as CancelLoadEvent);
		}

		it('expires the buyer’s own pending order', async () => {
			expect(await cancel(seeded.users.nobody.id, `?order=${order.id}`)).toEqual({
				cancelled: true
			});
			expect((await seeded.services.commerce.orders.getById(order.id))?.status).toBe('expired');
		});

		it('leaves the order alone for another user, a signed-out visitor or a bad id', async () => {
			expect(await cancel(seeded.users.bundleOwner.id, `?order=${order.id}`)).toEqual({
				cancelled: false
			});
			expect(await cancel(null, `?order=${order.id}`)).toEqual({ cancelled: false });
			expect(await cancel(seeded.users.nobody.id, '?order=not-a-uuid')).toEqual({
				cancelled: false
			});
			expect(await cancel(seeded.users.nobody.id, '')).toEqual({ cancelled: false });
			expect((await seeded.services.commerce.orders.getById(order.id))?.status).toBe('pending');
		});
	});
});
