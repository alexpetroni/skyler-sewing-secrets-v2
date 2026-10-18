import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { parseQuery, userSearchQuerySchema } from '#lib/shared/schemas/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { q, page } = parseQuery(userSearchQuerySchema, event.url.searchParams);
	return { q, users: await event.locals.services.admin.users.search(q, page) };
};
