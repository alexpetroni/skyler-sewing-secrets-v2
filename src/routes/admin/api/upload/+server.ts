import { domainErrorResponse } from '#lib/server/http/api.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { RequestHandler } from './$types';

/**
 * Admin file upload (images, PDFs) to Bunny Storage: one multipart `file`
 * part, at most 25 MB, stored under `uploads/<yyyy>/<mm>/<uuid>.<ext>`.
 * Answers `{ url }`, the plain CDN URL for the editors' URL fields.
 */
export const POST: RequestHandler = async (event) => {
	const { user } = requireAdmin(event);
	let file: FormDataEntryValue | null;
	try {
		file = (await event.request.formData()).get('file');
	} catch {
		return Response.json({ error: 'Expected a multipart form with a file' }, { status: 400 });
	}
	if (!(file instanceof File)) {
		return Response.json({ error: 'Expected a multipart form with a file' }, { status: 400 });
	}
	try {
		const stored = await event.locals.services.admin.uploads.store({
			contentType: file.type,
			size: file.size,
			read: async () => new Uint8Array(await file.arrayBuffer()),
			actorId: user.id
		});
		return Response.json({ url: stored.url });
	} catch (err) {
		return domainErrorResponse(err);
	}
};
