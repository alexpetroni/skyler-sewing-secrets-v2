import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { orderListQuerySchema, parseQuery } from '#lib/shared/schemas/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const filters = parseQuery(orderListQuerySchema, event.url.searchParams);
	return { filters, orders: await event.locals.services.admin.orders.list(filters) };
};
