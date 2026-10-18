import { cataloguePage } from '#lib/server/http/shop.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const cart = locals.services.commerce.cartCookie.read(cookies);
	return cataloguePage(locals, cart.items);
};
