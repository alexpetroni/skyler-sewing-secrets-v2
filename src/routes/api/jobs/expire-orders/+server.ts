import { isCronAuthorised } from '#lib/server/http/cron.ts';
import type { RequestHandler } from './$types';

/** Vercel function limit (seconds). */
export const config = { maxDuration: 60 };

/** Vercel cron (every 15 minutes): releases promo codes held by abandoned checkouts. */
export const GET: RequestHandler = async ({ request, locals }) => {
	const { cronSecret, commerce } = locals.services;
	if (!isCronAuthorised(request, cronSecret)) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const expired = await commerce.orders.expireStale();
	locals.log.info('expire-orders job ran', { expired: expired.length });
	return Response.json({ expired: expired.length });
};
