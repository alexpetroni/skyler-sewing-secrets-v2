import { error } from '@sveltejs/kit';
import { productPage } from '#lib/server/http/shop.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
	const cart = locals.services.commerce.cartCookie.read(cookies);
	// Unpublished and unknown slugs look the same from outside.
	const page = await productPage(locals, params.slug, cart.items);
	if (!page) error(404, 'Product not found');
	return page;
};
