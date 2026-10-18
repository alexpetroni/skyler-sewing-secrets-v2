import * as v from 'valibot';
import { accessContext } from '#lib/server/http/member-area.ts';
import { canAccessLesson } from '#lib/server/modules/entitlements/index.ts';
import { progressInputSchema, progressQuerySchema } from '#lib/shared/schemas/content.ts';
import type { RequestEvent, RequestHandler } from './$types';

/** A signed-in, unsuspended account, or the 401/403 response to send instead. */
function signedIn({ locals }: RequestEvent): { userId: string } | Response {
	if (!locals.user || !locals.profile) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (locals.profile.is_suspended) {
		return Response.json({ error: 'Account suspended' }, { status: 403 });
	}
	return { userId: locals.user.id };
}

const invalid = () => Response.json({ error: 'Invalid request' }, { status: 400 });

export const POST: RequestHandler = async (event) => {
	const viewer = signedIn(event);
	if (viewer instanceof Response) return viewer;

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return invalid();
	}
	const parsed = v.safeParse(progressInputSchema, body);
	if (!parsed.success) return invalid();

	const { content } = event.locals.services;
	const lesson = await content.lessons.getById(parsed.output.lessonId, { publishedOnly: true });
	if (!lesson) return Response.json({ error: 'Lesson not found' }, { status: 404 });
	// Anyone signed in may record progress on a free preview; otherwise ownership decides.
	const ctx = await accessContext(event.locals);
	if (!canAccessLesson(ctx, { id: lesson.id, isFreePreview: lesson.is_free_preview })) {
		return Response.json({ error: 'Forbidden' }, { status: 403 });
	}

	const progress = await content.progress.upsert({ userId: viewer.userId, ...parsed.output });
	return Response.json({ success: true, progress });
};

export const GET: RequestHandler = async (event) => {
	const viewer = signedIn(event);
	if (viewer instanceof Response) return viewer;

	const { searchParams } = event.url;
	const parsed = v.safeParse(progressQuerySchema, {
		lessonId: searchParams.get('lessonId') ?? undefined,
		moduleId: searchParams.get('moduleId') ?? undefined
	});
	if (!parsed.success) return invalid();

	const progress = await event.locals.services.content.progress.forUser(
		viewer.userId,
		parsed.output
	);
	return Response.json({ progress });
};
