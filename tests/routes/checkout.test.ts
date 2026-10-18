import { eq } from 'drizzle-orm';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import {
	CART_COOKIE_NAME,
	serializeCart,
	type CartQuote,
	type CartState
} from '../../src/lib/server/modules/commerce/index.ts';
import { PROMO_REJECTION_MESSAGES } from '../../src/lib/shared/promo-messages.ts';
import { actions, load } from '../../src/routes/(shop)/checkout/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent } from '../helpers/member.ts';
import { TEST_AUTH_SECRET } from '../helpers/services.ts';

// The sveltekitCookies plugin copies Better Auth's cookies onto the current
// request event; the test hands it the fake event of the action under test.
const current = vi.hoisted(() => ({ event: null as unknown }));
vi.mock('$app/server', () => ({ getRequestEvent: () => current.event }));

const { users, profiles, orders, sessions } = schema;

type ActionEvent = Parameters<typeof actions.checkout>[0];
type LoadEvent = Parameters<typeof load>[0];
interface CheckoutData {
	quote: CartQuote;
	signedIn: { email: string } | null;
	googleEnabled: boolean;
}

const NEW_BUYER = {
	fullName: 'New Buyer',
	email: 'New.Buyer@Example.com',
	password: 'a-brand-new-password'
};

function cookieHeader(state: CartState): Record<string, string> {
	return { cookie: `${CART_COOKIE_NAME}=${serializeCart(state, TEST_AUTH_SECRET)}` };
}

describe('/checkout', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
	});

	async function submit(
		userId: string | null,
		state: CartState,
		fields: Record<string, string> = {}
	) {
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: '/checkout?/checkout',
			headers: cookieHeader(state),
			body: new URLSearchParams(fields)
		});
		current.event = event;
		let result: unknown;
		let thrown: unknown;
		try {
			result = await actions.checkout(event as unknown as ActionEvent);
		} catch (err) {
			thrown = err;
		}
		return { event, result, thrown };
	}

	async function loadPage(userId: string | null, state: CartState) {
		const event = await memberEvent(seeded.services, userId, {
			url: '/checkout',
			headers: cookieHeader(state)
		});
		return (await load(event as unknown as LoadEvent)) as CheckoutData;
	}

	const cart = (items: string[], promoCode: string | null = null): CartState => ({
		items,
		promoCode
	});

	describe('load', () => {
		it('redirects an empty cart to /cart', async () => {
			await expect(loadPage(null, cart([]))).rejects.toMatchObject({
				status: 303,
				location: '/cart'
			});
			// A cart emptied by ownership counts as empty too.
			await expect(
				loadPage(seeded.users.member.id, cart([seeded.bundle.id]))
			).rejects.toMatchObject({ status: 303, location: '/cart' });
		});

		it('quotes the cart and tells the page whether to show the account form', async () => {
			const signedOut = await loadPage(null, cart([seeded.bundle.id, seeded.single.id]));
			expect(signedOut.signedIn).toBeNull();
			expect(signedOut.quote.total).toBe(3800);
			expect(signedOut.quote.lines.map((line) => line.title)).toEqual([
				'basics-bundle',
				'standalone-video'
			]);
			expect(signedOut.googleEnabled).toBe(false);

			const signedIn = await loadPage(seeded.users.nobody.id, cart([seeded.single.id]));
			expect(signedIn.signedIn).toEqual({ email: seeded.users.nobody.email });
		});
	});

	describe('action checkout, signed out', () => {
		it('creates an unverified account, signs it in, creates a pending order and redirects to Stripe', async () => {
			const state = cart([seeded.bundle.id, seeded.single.id]);
			const { event, result, thrown } = await submit(null, state, NEW_BUYER);

			expect(result).toBeUndefined();
			if (!isRedirect(thrown)) throw new Error(`expected a redirect, got ${String(thrown)}`);
			expect(thrown.status).toBe(303);
			expect(thrown.location).toMatch(/^https:\/\/fake\.stripe\/cs_test_fake_\d+$/);

			const [user] = await db()
				.select()
				.from(users)
				.where(eq(users.email, 'new.buyer@example.com'));
			expect(user).toBeDefined();
			expect(user.emailVerified).toBe(false);
			expect(user.name).toBe('New Buyer');
			const [profile] = await db().select().from(profiles).where(eq(profiles.id, user.id));
			expect(profile.is_admin).toBe(false);
			expect(profile.is_member).toBe(false);

			// Signed in: a session row exists and its cookie was set on the response.
			const sessionRows = await db().select().from(sessions).where(eq(sessions.userId, user.id));
			expect(sessionRows).toHaveLength(1);
			expect(event.setCookies.some((call) => call.name.includes('session_token'))).toBe(true);

			const [order] = await db().select().from(orders).where(eq(orders.user_id, user.id));
			expect(order.status).toBe('pending');
			expect(order.total).toBe(3800);
			const session = seeded.services.payments.sessions.get(order.stripe_checkout_session_id ?? '');
			expect(session?.input.orderId).toBe(order.id);
			expect(session?.input.customerEmail).toBe('new.buyer@example.com');
			expect(thrown.location).toBe(`https://fake.stripe/${order.stripe_checkout_session_id}`);
		});

		it('refuses a duplicate email with 400 and creates no order', async () => {
			const { result } = await submit(null, cart([seeded.single.id]), {
				...NEW_BUYER,
				email: 'NOBODY@example.com'
			});
			expect(isActionFailure(result)).toBe(true);
			if (!isActionFailure(result)) return;
			expect(result.status).toBe(400);
			expect(result.data).toMatchObject({
				email: 'NOBODY@example.com',
				fullName: NEW_BUYER.fullName,
				errors: { email: 'This email is already registered. Please sign in instead.' }
			});
			expect(await db().select().from(orders)).toEqual([]);
			expect(await db().select().from(users)).toHaveLength(3);
			expect(seeded.services.payments.sessions.size).toBe(0);
		});

		it('validates the account form as legacy did', async () => {
			const { result } = await submit(null, cart([seeded.single.id]), {
				fullName: 'X',
				email: 'not-an-email',
				password: 'short'
			});
			expect(isActionFailure(result)).toBe(true);
			if (!isActionFailure(result)) return;
			expect(result.status).toBe(400);
			expect(result.data).toEqual({
				fullName: 'X',
				email: 'not-an-email',
				errors: {
					fullName: 'Please enter your full name',
					email: 'Please enter a valid email address',
					password: 'Password must be at least 8 characters'
				}
			});
			expect(await db().select().from(users)).toHaveLength(3);
			expect(await db().select().from(orders)).toEqual([]);
		});
	});

	describe('action checkout, signed in', () => {
		it('needs no account fields and redirects to Stripe with the buyer’s order', async () => {
			const buyer = seeded.users.nobody;
			const { result, thrown } = await submit(buyer.id, cart([seeded.bundle.id]));
			expect(result).toBeUndefined();
			if (!isRedirect(thrown)) throw new Error(`expected a redirect, got ${String(thrown)}`);
			expect(thrown.status).toBe(303);

			const [order] = await db().select().from(orders).where(eq(orders.user_id, buyer.id));
			expect(order.status).toBe('pending');
			expect(order.total).toBe(2900);
			expect(thrown.location).toBe(`https://fake.stripe/${order.stripe_checkout_session_id}`);
			expect(
				seeded.services.payments.sessions.get(order.stripe_checkout_session_id ?? '')?.input
					.customerEmail
			).toBe(buyer.email);
			expect(await db().select().from(users)).toHaveLength(3);
		});

		it('maps an empty cart to 400 and a rejected code to 409 with the buyer message', async () => {
			const buyer = seeded.users.nobody.id;
			const empty = await submit(buyer, cart([]));
			expect(isActionFailure(empty.result)).toBe(true);
			if (isActionFailure(empty.result)) {
				expect(empty.result.status).toBe(400);
				expect(empty.result.data).toEqual({ error: 'Your cart is empty.' });
			}

			const rejected = await submit(buyer, cart([seeded.single.id], 'NOPE'));
			expect(isActionFailure(rejected.result)).toBe(true);
			if (isActionFailure(rejected.result)) {
				expect(rejected.result.status).toBe(409);
				expect(rejected.result.data).toEqual({ error: PROMO_REJECTION_MESSAGES.not_found });
			}
			expect(await db().select().from(orders)).toEqual([]);
		});

		it('expires the order and returns 502 when the gateway fails', async () => {
			const buyer = seeded.users.nobody.id;
			seeded.services.payments.createCheckoutSession = async () => {
				throw new Error('stripe is down');
			};
			const { result } = await submit(buyer, cart([seeded.single.id]));
			expect(isActionFailure(result)).toBe(true);
			if (!isActionFailure(result)) return;
			expect(result.status).toBe(502);
			expect(result.data).toEqual({
				error: 'Failed to create checkout session. Please try again.'
			});
			const [order] = await db().select().from(orders).where(eq(orders.user_id, buyer));
			expect(order.status).toBe('expired');
			expect(order.stripe_checkout_session_id).toBeNull();
		});
	});
});
