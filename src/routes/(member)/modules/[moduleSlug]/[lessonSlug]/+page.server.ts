import { error } from '@sveltejs/kit';
import { lessonPage } from '#lib/server/http/member-area.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const found = await event.locals.services.content.lessons.getBySlugs(
		event.params.moduleSlug,
		event.params.lessonSlug,
		{ publishedOnly: true }
	);
	if (!found) error(404, 'Lesson not found');
	// Open, locked (upsell only) or 403 for a suspended account, per canAccessLesson.
	return lessonPage(event, found.lesson, found.module);
};
