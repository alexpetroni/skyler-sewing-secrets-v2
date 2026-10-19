import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { cartViewer } from '#lib/server/http/shop.ts';
import { keyFor } from '#lib/server/platform/request-limits.ts';
import {
	EmptyCartError,
	PromoInvalidError,
	PromoRejectedError
} from '#lib/server/modules/commerce/index.ts';
import { promoRejectionMessage } from '#lib/shared/promo-messages.ts';
import { isDomainError } from '#lib/server/http/api.ts';
import {
	checkoutAccountSchema,
	claimCodeSchema,
	claimEmailSchema,
	fieldErrors
} from '#lib/shared/schemas/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const ALREADY_REGISTERED = 'This email is already registered. Please sign in instead.';
const CLAIMABLE =
	'An account with this email exists but was never confirmed. We can email you a code to claim it.';
const CLAIM_SENT = 'We emailed you a six-digit code. Enter it below to claim the account.';
const CLAIM_FAILED = 'That code is not right or has expired. Request a new one and try again.';
const CLAIM_NOT_OFFERED = 'This account cannot be claimed. Please sign in instead.';
const ACCOUNT_FAILED = 'Could not create your account. Please try again.';
const SIGN_IN_FAILED =
	'Your account was created but we could not sign you in. Please sign in with the password you chose and return to checkout.';
const EMPTY_CART = 'Your cart is empty.';
const GATEWAY_FAILED = 'Failed to create checkout session. Please try again.';
const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a few minutes and try again.';

/** The account step creates users and signs them in outside Better Auth's HTTP limiter (security audit H5). */
const ACCOUNT_LIMIT = { max: 5, windowSeconds: 15 * 60 };

/**
 * Account-first checkout, as legacy: a signed-out buyer creates their account
 * here (unverified until Stripe confirms the paid address), is signed in, and
 * only then is the order created and the Stripe redirect issued. No admin
 * flag is ever derived from an email address.
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const { cart, cartCookie } = locals.services.commerce;
	const quote = await cart.quote(cartCookie.read(cookies), cartViewer(locals));
	if (quote.lines.length === 0) redirect(303, '/cart');
	// A session without a profile is stale: treat it as signed out.
	const signedIn = locals.user && locals.profile ? { email: locals.user.email } : null;
	return {
		quote,
		signedIn,
		googleEnabled: locals.services.googleEnabled,
		// Just claimed an account with an emailed code: the flash about setting a password.
		claimed: signedIn !== null && url.searchParams.has('claimed')
	};
};

export const actions: Actions = {
	checkout: async (event) => {
		const { request, locals, cookies } = event;
		const { services } = locals;
		const { orders, cartCookie } = services.commerce;

		let userId: string;
		let email: string;
		if (locals.user && locals.profile) {
			userId = locals.user.id;
			email = locals.user.email;
		} else {
			const form = await readForm(request);
			const echo = { fullName: form.fullName ?? '', email: form.email ?? '' };
			const parsed = v.safeParse(checkoutAccountSchema, form);
			if (!parsed.success) return fail(400, { ...echo, errors: fieldErrors(parsed.issues) });
			const { fullName, password } = parsed.output;
			email = parsed.output.email;

			const limit = await services.limiter.consume(
				keyFor('checkout-account', event),
				ACCOUNT_LIMIT
			);
			if (!limit.allowed) return fail(429, { ...echo, error: TOO_MANY_ATTEMPTS });

			if (await services.users.findUserIdByEmail(email)) {
				// An unverified, order-less account (a pre-registration, perhaps
				// by this very buyer) may be claimed with an emailed code.
				if (await services.users.claimable(email)) {
					return fail(400, { ...echo, errors: { email: CLAIMABLE }, claimable: true });
				}
				return fail(400, { ...echo, errors: { email: ALREADY_REGISTERED } });
			}
			try {
				userId = await services.users.createCredentialUser({ email, password, fullName });
			} catch (err) {
				// `users.email` is unique: a row that appeared meanwhile is a duplicate sign-up.
				if (await services.users.findUserIdByEmail(email)) {
					return fail(400, { ...echo, errors: { email: ALREADY_REGISTERED } });
				}
				locals.log.error('checkout account creation failed', {
					error: err instanceof Error ? err.message : String(err)
				});
				return fail(500, { ...echo, error: ACCOUNT_FAILED });
			}
			// The session cookie is set through the sveltekitCookies plugin.
			try {
				await services.auth.api.signInEmail({
					body: { email, password },
					headers: request.headers
				});
			} catch (err) {
				locals.log.error('checkout sign-in failed', {
					userId,
					error: err instanceof Error ? err.message : String(err)
				});
				return fail(500, { ...echo, error: SIGN_IN_FAILED });
			}
			await services.users.trimSessions(userId, 5);
		}

		let orderId: string;
		try {
			const order = await orders.createPendingOrder({
				userId,
				state: cartCookie.read(cookies),
				viewer: { id: userId }
			});
			orderId = order.id;
		} catch (err) {
			if (err instanceof EmptyCartError) return fail(400, { error: EMPTY_CART });
			if (err instanceof PromoInvalidError || err instanceof PromoRejectedError) {
				return fail(409, { error: promoRejectionMessage(err.reason) });
			}
			throw err;
		}

		let url: string;
		try {
			url = await orders.startCheckout(orderId, { customerEmail: email });
		} catch (err) {
			locals.log.error('checkout session creation failed', {
				orderId,
				error: err instanceof Error ? err.message : String(err)
			});
			await orders.expire(orderId);
			return fail(502, { error: GATEWAY_FAILED });
		}

		redirect(303, url, { external: true });
	},

	/** Emails the claim code; only unverified, order-less accounts are offered it. */
	sendClaimCode: async (event) => {
		const { services } = event.locals;
		if (event.locals.user && event.locals.profile) redirect(303, '/checkout');
		const parsed = v.safeParse(claimEmailSchema, await readForm(event.request));
		if (!parsed.success) return fail(400, { email: '', errors: fieldErrors(parsed.issues) });
		const { email } = parsed.output;

		const limit = await services.limiter.consume(keyFor('checkout-account', event), ACCOUNT_LIMIT);
		if (!limit.allowed) return fail(429, { email, error: TOO_MANY_ATTEMPTS });
		if (!(await services.users.claimable(email))) {
			return fail(400, { email, errors: { email: CLAIM_NOT_OFFERED } });
		}
		await services.auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
		return { claim: { email, message: CLAIM_SENT } };
	},

	/** A correct code signs the claimant in and marks the email verified; checkout then continues. */
	claim: async (event) => {
		const { services } = event.locals;
		if (event.locals.user && event.locals.profile) redirect(303, '/checkout');
		const parsed = v.safeParse(claimCodeSchema, await readForm(event.request));
		if (!parsed.success) {
			return fail(400, { claim: { email: '', message: null }, errors: fieldErrors(parsed.issues) });
		}
		const { email, code } = parsed.output;
		const claim = { email, message: null };
		if (!(await services.users.claimable(email))) {
			return fail(400, { claim, errors: { email: CLAIM_NOT_OFFERED } });
		}

		// The session cookie is set through the sveltekitCookies plugin.
		let userId: string;
		try {
			const result = await services.auth.api.signInEmailOTP({
				body: { email, otp: code },
				headers: event.request.headers
			});
			userId = result.user.id;
		} catch (err) {
			// Better Auth refuses with an APIError (wrong, expired or spent code);
			// a DomainError is a service refusal with its own message; anything
			// else is a bug.
			if (isDomainError(err)) return fail(400, { claim, errors: { code: err.message } });
			if (!(err instanceof APIError)) throw err;
			event.locals.log.info('checkout claim refused');
			return fail(400, { claim, errors: { code: CLAIM_FAILED } });
		}
		await services.users.trimSessions(userId, 5);
		redirect(303, '/checkout?claimed=1');
	}
};
