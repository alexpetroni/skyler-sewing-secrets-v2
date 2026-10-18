import { error } from '@sveltejs/kit';
import { lessonPage } from '#lib/server/http/member-area.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const lesson = await event.locals.services.content.lessons.getStandaloneBySlug(
		event.params.slug,
		{ publishedOnly: true }
	);
	if (!lesson) error(404, 'Video not found');
	// Open, locked (upsell only) or 403 for a suspended account, per canAccessLesson.
	return lessonPage(event, lesson, null);
};
