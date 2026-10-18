import * as v from 'valibot';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { PageServerLoad } from './$types';

/**
 * Stripe sends the buyer back here when they close the payment page. Only
 * the signed-in buyer's own pending order is released; anyone else just sees
 * the page.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const parsed = v.safeParse(idSchema, url.searchParams.get('order'));
	const cancelled =
		parsed.success && locals.user
			? await locals.services.commerce.orders.cancelPending(parsed.output, locals.user.id)
			: false;
	return { cancelled };
};
