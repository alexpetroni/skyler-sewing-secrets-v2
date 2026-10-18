import { domainErrorResponse, readJson } from '#lib/server/http/api.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { reissueTicketSchema } from '#lib/shared/schemas/admin.ts';
import type { RequestHandler } from './$types';

/** A fresh ticket for the same Bunny video, so an interrupted upload can resume. */
export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = await readJson(event.request, reissueTicketSchema);
	if (!body.ok) return body.response;
	const { assetId } = body.data;
	try {
		const ticket = await event.locals.services.media.reissueTicket(assetId);
		return Response.json({ assetId, endpoint: ticket.endpoint, headers: ticket.headers });
	} catch (err) {
		return domainErrorResponse(err);
	}
};
