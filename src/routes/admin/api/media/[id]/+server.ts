import * as v from 'valibot';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { RequestHandler } from './$types';

/** The upload form polls this until Bunny reports the encode `ready` or `failed`. */
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const id = event.params.id;
	const asset = v.is(idSchema, id) ? await event.locals.services.media.get(id) : null;
	if (!asset) return Response.json({ error: 'Video not found' }, { status: 404 });
	return Response.json({
		id: asset.id,
		title: asset.title,
		status: asset.status,
		durationSeconds: asset.duration_seconds,
		thumbnailUrl: asset.thumbnail_url
	});
};
