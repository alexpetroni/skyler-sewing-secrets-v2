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

const { users, accounts, profiles, orders, sessions } = schema;

type ActionEvent = Parameters<typeof actions.checkout>[0];
type LoadEvent = Parameters<typeof load>[0];
interface CheckoutData {
	quote: CartQuote;
	signedIn: { email: string } | null;
	googleEnabled: boolean;
	claimed: boolean;
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

	async function loadPage(userId: string | null, state: CartState, search = '') {
		const event = await memberEvent(seeded.services, userId, {
			url: `/checkout${search}`,
			headers: cookieHeader(state)
		});
		return (await load(event as unknown as LoadEvent)) as CheckoutData;
	}

	/** Runs one of the claim actions as `userId` with the given fields. */
	async function runClaim(
		action: 'sendClaimCode' | 'claim',
		userId: string | null,
		fields: Record<string, string>
	) {
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: `/checkout?/${action}`,
			headers: cookieHeader(cart([seeded.single.id])),
			body: new URLSearchParams(fields)
		});
		current.event = event;
		let result: unknown;
		let thrown: unknown;
		try {
			result = await actions[action](
				event as unknown as Parameters<(typeof actions)[typeof action]>[0]
			);
		} catch (err) {
			thrown = err;
		}
		return { event, result, thrown };
	}

	/** The six-digit code in the most recent claim email to `email`. */
	function emailedCode(email: string): string {
		const mail = seeded.services.mailer.lastTo(email);
		const match = mail?.text.match(/\b(\d{6})\b/);
		if (!match) throw new Error(`no code emailed to ${email}`);
		return match[1];
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
			expect(signedIn.claimed).toBe(false);
		});

		it('flags a just-claimed account only for a signed-in visitor', async () => {
			expect((await loadPage(null, cart([seeded.single.id]), '?claimed=1')).claimed).toBe(false);
			expect(
				(await loadPage(seeded.users.nobody.id, cart([seeded.single.id]), '?claimed=1')).claimed
			).toBe(true);
		});
	});

	describe('account claim', () => {
		const CLAIMABLE =
			'An account with this email exists but was never confirmed. We can email you a code to claim it.';
		const NOT_OFFERED = 'This account cannot be claimed. Please sign in instead.';

		/** `nobody` as seeded: unverified, no orders. */
		const claimant = () => seeded.users.nobody;

		async function verify(userId: string) {
			await db().update(users).set({ emailVerified: true }).where(eq(users.id, userId));
		}
		async function giveOrder(userId: string) {
			await db().insert(orders).values({ user_id: userId, status: 'paid', subtotal: 1, total: 1 });
		}

		it('is offered by the account step only for an unverified account without orders', async () => {
			const { email } = claimant();
			const offered = await submit(null, cart([seeded.single.id]), { ...NEW_BUYER, email });
			if (!isActionFailure(offered.result)) throw new Error('expected a failure');
			expect(offered.result.status).toBe(400);
			expect(offered.result.data).toEqual({
				fullName: NEW_BUYER.fullName,
				email,
				errors: { email: CLAIMABLE },
				claimable: true
			});

			await giveOrder(claimant().id);
			const ordering = await submit(null, cart([seeded.single.id]), { ...NEW_BUYER, email });
			if (!isActionFailure(ordering.result)) throw new Error('expected a failure');
			expect(ordering.result.data).toEqual({
				fullName: NEW_BUYER.fullName,
				email,
				errors: { email: 'This email is already registered. Please sign in instead.' }
			});

			const { bundleOwner } = seeded.users;
			await verify(bundleOwner.id);
			const verified = await submit(null, cart([seeded.single.id]), {
				...NEW_BUYER,
				email: bundleOwner.email
			});
			if (!isActionFailure(verified.result)) throw new Error('expected a failure');
			expect(verified.result.data).not.toHaveProperty('claimable');
		});

		it('sendClaimCode emails a six-digit code through the mailer, to claimable accounts only', async () => {
			const { email } = claimant();
			const { result } = await runClaim('sendClaimCode', null, { email: email.toUpperCase() });
			expect(result).toEqual({
				claim: {
					email,
					message: 'We emailed you a six-digit code. Enter it below to claim the account.'
				}
			});
			const mail = seeded.services.mailer.lastTo(email);
			expect(mail?.subject).toMatch(/^\d{6} is your Skyler's Sewing Secrets code$/);
			expect(mail?.text).toContain(emailedCode(email));

			await verify(claimant().id);
			const refused = await runClaim('sendClaimCode', null, { email });
			if (!isActionFailure(refused.result)) throw new Error('expected a failure');
			expect(refused.result.data).toEqual({ email, errors: { email: NOT_OFFERED } });

			const unknown = await runClaim('sendClaimCode', null, { email: 'nobody-here@example.com' });
			if (!isActionFailure(unknown.result)) throw new Error('expected a failure');
			expect(unknown.result.status).toBe(400);
			expect(seeded.services.mailer.sent).toHaveLength(1);

			// Signed-in visitors have nothing to claim.
			const signedIn = await runClaim('sendClaimCode', seeded.users.member.id, { email });
			expect(signedIn.thrown).toMatchObject({ status: 303, location: '/checkout' });
		});

		it('a correct code signs the claimant in, verifies the email and drops the unproven password', async () => {
			const { id, email } = claimant();
			await runClaim('sendClaimCode', null, { email });
			const code = emailedCode(email);

			const wrong = await runClaim('claim', null, { email, code: '000000' });
			if (!isActionFailure(wrong.result)) throw new Error('expected a failure');
			expect(wrong.result.status).toBe(400);
			expect(wrong.result.data).toEqual({
				claim: { email, message: null },
				errors: { code: 'That code is not right or has expired. Request a new one and try again.' }
			});
			expect(await db().select().from(sessions).where(eq(sessions.userId, id))).toEqual([]);

			const malformed = await runClaim('claim', null, { email, code: '12' });
			if (!isActionFailure(malformed.result)) throw new Error('expected a failure');
			expect(malformed.result.data).toMatchObject({ errors: { code: 'The code is six digits' } });

			const { event, thrown } = await runClaim('claim', null, { email, code });
			expect(thrown).toMatchObject({ status: 303, location: '/checkout?claimed=1' });
			expect(event.setCookies.map((cookie) => cookie.name)).toContain('better-auth.session_token');
			expect(await db().select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(1);
			const [user] = await db().select().from(users).where(eq(users.id, id));
			expect(user.emailVerified).toBe(true);
			// Whoever pre-registered the address no longer holds a password for it.
			expect(await db().select().from(accounts).where(eq(accounts.userId, id))).toEqual([]);
			expect(await seeded.services.users.hasPassword(id)).toBe(false);

			// The code is spent, and a verified account is no longer claimable.
			const again = await runClaim('claim', null, { email, code });
			if (!isActionFailure(again.result)) throw new Error('expected a failure');
			expect(again.result.data).toEqual({
				claim: { email, message: null },
				errors: { email: NOT_OFFERED }
			});
		});

		it('shares the account step limit: the sixth request from one address gets 429', async () => {
			const { email } = claimant();
			for (let attempt = 1; attempt <= 5; attempt++) {
				const { result } = await runClaim('sendClaimCode', null, { email });
				expect(result).toMatchObject({ claim: { email } });
			}
			const { result } = await runClaim('sendClaimCode', null, { email });
			if (!isActionFailure(result)) throw new Error('expected a failure');
			expect(result.status).toBe(429);
			expect(seeded.services.mailer.sent).toHaveLength(5);
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
			// A verified account gets the plain "sign in" answer (the claim offer is tested below).
			await db()
				.update(users)
				.set({ emailVerified: true })
				.where(eq(users.id, seeded.users.nobody.id));
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

		it('answers 429 to the sixth account attempt from one address within 15 minutes', async () => {
			for (let attempt = 1; attempt <= 5; attempt++) {
				const { result } = await submit(null, cart([seeded.single.id]), {
					...NEW_BUYER,
					email: 'nobody@example.com'
				});
				if (!isActionFailure(result)) throw new Error('expected a failure');
				expect(result.status).toBe(400);
			}

			const { result } = await submit(null, cart([seeded.single.id]), NEW_BUYER);
			if (!isActionFailure(result)) throw new Error('expected a failure');
			expect(result.status).toBe(429);
			expect(result.data).toEqual({
				fullName: NEW_BUYER.fullName,
				email: NEW_BUYER.email,
				error: 'Too many attempts. Please wait a few minutes and try again.'
			});
			expect(await db().select().from(users)).toHaveLength(3);
			expect(await db().select().from(orders)).toEqual([]);
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
