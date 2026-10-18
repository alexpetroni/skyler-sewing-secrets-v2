import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { accessContext, ownsLesson } from '#lib/server/http/member-area.ts';
import { requireUser } from '#lib/server/modules/auth/index.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	// Sign-in redirect back here, 403 for suspended accounts.
	requireUser(event);
	const resourceId = v.safeParse(idSchema, event.params.resourceId);
	if (!resourceId.success) error(404, 'Resource not found');

	const found = await event.locals.services.content.resources.getById(resourceId.output);
	if (!found || !found.lesson.is_published) error(404, 'Resource not found');
	// Owners only: a free preview does not open its resources.
	const ctx = await accessContext(event.locals);
	if (!ownsLesson(ctx, { id: found.lesson.id, isFreePreview: found.lesson.is_free_preview })) {
		error(403, 'You do not have access to this resource');
	}
	// The stored URL is public; short-lived signed storage URLs come in PHASE-20.
	redirect(302, found.resource.file_url, { external: true });
};
