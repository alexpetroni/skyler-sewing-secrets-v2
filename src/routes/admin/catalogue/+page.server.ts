import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return { products: await event.locals.services.catalog.listAllWithTotals() };
};
