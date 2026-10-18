import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { cartPage, cartViewer } from '#lib/server/http/shop.ts';
import {
	acknowledgeRemovals,
	clear,
	removeItem,
	setPromo
} from '#lib/server/modules/commerce/index.ts';
import { promoRejectionMessage } from '#lib/shared/promo-messages.ts';
import { cartItemSchema, cartPromoSchema } from '#lib/shared/schemas/commerce.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'That product is not available.';

// Every action writes through `cartCookie.write`, which signs the state
// (HMAC) and sets `httpOnly`, `sameSite: 'lax'`, `path: '/'`, and `secure`
// over https (`cartCookieOptions` in modules/commerce/cart.ts).

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const { cartCookie } = locals.services.commerce;
	const state = cartCookie.read(cookies);
	const page = await cartPage(locals, state);
	// Each removal is explained once: the next render no longer finds it.
	if (page.quote.removed.length > 0) {
		cartCookie.write(cookies, acknowledgeRemovals(state, page.quote));
	}
	return page;
};

export const actions: Actions = {
	add: async ({ request, locals, cookies }) => {
		const parsed = v.safeParse(cartItemSchema, await readForm(request));
		if (!parsed.success) return fail(400, { error: UNAVAILABLE });
		const { cart, cartCookie } = locals.services.commerce;
		const result = await cart.add(
			cartCookie.read(cookies),
			parsed.output.productId,
			cartViewer(locals)
		);
		if (!result.ok) return fail(400, { error: UNAVAILABLE });
		cartCookie.write(cookies, result.state);
		return { added: parsed.output.productId };
	},

	remove: async ({ request, locals, cookies }) => {
		const parsed = v.safeParse(cartItemSchema, await readForm(request));
		if (!parsed.success) return fail(400, { error: UNAVAILABLE });
		const { cartCookie } = locals.services.commerce;
		cartCookie.write(cookies, removeItem(cartCookie.read(cookies), parsed.output.productId));
		return { removed: parsed.output.productId };
	},

	applyPromo: async ({ request, locals, cookies }) => {
		// A malformed code reads like an unknown one: no hint about what exists.
		const parsed = v.safeParse(cartPromoSchema, await readForm(request));
		if (!parsed.success) return fail(400, { promoError: promoRejectionMessage('not_found') });
		const { cart, cartCookie } = locals.services.commerce;
		const state = setPromo(cartCookie.read(cookies), parsed.output.code);
		const quote = await cart.quote(state, cartViewer(locals));
		if (quote.rejection) {
			return fail(400, { promoError: promoRejectionMessage(quote.rejection) });
		}
		cartCookie.write(cookies, state);
		return { promoApplied: parsed.output.code };
	},

	removePromo: async ({ locals, cookies }) => {
		const { cartCookie } = locals.services.commerce;
		cartCookie.write(cookies, setPromo(cartCookie.read(cookies), null));
		return { promoRemoved: true };
	},

	clear: async ({ locals, cookies }) => {
		locals.services.commerce.cartCookie.write(cookies, clear());
		return { cleared: true };
	}
};
