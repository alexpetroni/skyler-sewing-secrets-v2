import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { auditQuerySchema, parseQuery } from '#lib/shared/schemas/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const filters = parseQuery(auditQuerySchema, event.url.searchParams);
	return { filters, entries: await event.locals.services.admin.audit.list(filters) };
};
