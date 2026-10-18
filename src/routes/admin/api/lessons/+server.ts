import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { lessonSearchQuerySchema, parseQuery } from '#lib/shared/schemas/admin.ts';
import type { RequestHandler } from './$types';

/** The product editor's item picker: up to 20 lessons with module, duration and products. */
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const { q } = parseQuery(lessonSearchQuerySchema, event.url.searchParams);
	return Response.json({ lessons: await event.locals.services.catalog.searchLessons(q) });
};
