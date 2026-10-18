import { readJson } from '#lib/server/http/api.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { uploadTicketSchema } from '#lib/shared/schemas/admin.ts';
import type { RequestHandler } from './$types';

/**
 * Starts an upload: Bunny creates the video, an `uploading` asset is stored,
 * and the browser gets the presigned TUS headers. The Bunny API key stays on
 * the server; only its signature leaves.
 */
export const POST: RequestHandler = async (event) => {
	const { user } = requireAdmin(event);
	const body = await readJson(event.request, uploadTicketSchema);
	if (!body.ok) return body.response;
	const { title, filetype } = body.data;
	const { asset, ticket } = await event.locals.services.media.createUpload({
		title,
		actorId: user.id
	});
	return Response.json({
		assetId: asset.id,
		endpoint: ticket.endpoint,
		headers: ticket.headers,
		metadata: { title, filetype }
	});
};
