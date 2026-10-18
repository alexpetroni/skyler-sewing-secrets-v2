import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { RequestHandler } from './$types';

/** Every subscriber as a download; the service quotes and formula-neutralises each cell. */
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	return new Response(await event.locals.services.marketing.newsletter.exportCsv(), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="newsletter-subscribers.csv"',
			'cache-control': 'no-store'
		}
	});
};
