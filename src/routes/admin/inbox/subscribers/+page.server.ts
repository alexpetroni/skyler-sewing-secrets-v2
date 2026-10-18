import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { parseQuery, subscriberListQuerySchema } from '#lib/shared/schemas/admin.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { status } = parseQuery(subscriberListQuerySchema, event.url.searchParams);
	const { rows, counts } = await event.locals.services.marketing.newsletter.listByStatus(status);
	return {
		status: status ?? null,
		counts,
		subscribers: rows.map((row) => ({
			id: row.id,
			email: row.email,
			status: row.status,
			subscribed_at: row.subscribed_at,
			confirmed_at: row.confirmed_at,
			unsubscribed_at: row.unsubscribed_at
		}))
	};
};
