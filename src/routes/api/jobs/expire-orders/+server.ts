import { isCronAuthorised } from '#lib/server/http/cron.ts';
import type { RequestHandler } from './$types';

/** Vercel cron (every 15 minutes): releases promo codes held by abandoned checkouts. */
export const GET: RequestHandler = async ({ request, locals }) => {
	const { cronSecret, commerce, logger } = locals.services;
	if (!isCronAuthorised(request, cronSecret)) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const expired = await commerce.orders.expireStale();
	logger.info('expire-orders job ran', { requestId: locals.requestId, expired: expired.length });
	return Response.json({ expired: expired.length });
};
