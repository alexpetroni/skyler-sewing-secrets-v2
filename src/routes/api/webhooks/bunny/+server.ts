import { domainErrorResponse, isDomainError, readJson } from '#lib/server/http/api.ts';
import { bunnyWebhookSchema } from '#lib/shared/schemas/media.ts';
import type { RequestHandler } from './$types';

/**
 * Bunny Stream webhook. The body is unsigned, so it is only a hint: another
 * library's video is refused (400), the delivery is recorded in
 * `webhook_events`, and the asset is re-read from the Bunny API rather than
 * taking `Status` on trust. Repeated deliveries are synced again and still
 * answered 200. Bunny failures are 500s so the delivery is retried.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { media, logger } = locals.services;
	const log = logger.child({ requestId: locals.requestId });

	const body = await readJson(request, bunnyWebhookSchema);
	if (!body.ok) {
		log.warn('bunny webhook rejected', { reason: 'invalid body' });
		return body.response;
	}
	const { VideoLibraryId, VideoGuid, Status } = body.data;

	try {
		const { asset, duplicate } = await media.receiveWebhook({
			libraryId: VideoLibraryId,
			videoGuid: VideoGuid,
			status: Status
		});
		if (duplicate) log.info('bunny webhook repeated', { videoGuid: VideoGuid, status: Status });
		log.info('bunny webhook handled', {
			videoGuid: VideoGuid,
			status: Status,
			assetId: asset?.id ?? null,
			assetStatus: asset?.status ?? null
		});
		return Response.json({ received: true });
	} catch (err) {
		if (isDomainError(err)) {
			log.warn('bunny webhook refused', { videoGuid: VideoGuid, libraryId: VideoLibraryId });
			return domainErrorResponse(err);
		}
		log.error('bunny webhook failed', {
			videoGuid: VideoGuid,
			error: err instanceof Error ? err.message : String(err)
		});
		return Response.json({ error: 'Webhook handling failed' }, { status: 500 });
	}
};
