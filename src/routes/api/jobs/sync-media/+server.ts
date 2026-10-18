import { isCronAuthorised } from '#lib/server/http/cron.ts';
import type { RequestHandler } from './$types';

/** Vercel cron (hourly): re-fetches videos whose Bunny webhook never arrived. */
export const GET: RequestHandler = async ({ request, locals }) => {
	const { cronSecret, media, logger } = locals.services;
	if (!isCronAuthorised(request, cronSecret)) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	const { synced, failedAssetIds } = await media.syncProcessing({ olderThanMinutes: 30 });
	logger.info('sync-media job ran', {
		requestId: locals.requestId,
		synced,
		failed: failedAssetIds.length
	});
	return Response.json({ synced, failed: failedAssetIds.length });
};
