import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { LessonListFilter } from '#lib/server/modules/content/index.ts';
import { lessonListQuerySchema, parseQuery } from '#lib/shared/schemas/admin.ts';
import type { PageServerLoad } from './$types';

const FILTERS = {
	standalone: { standalone: true },
	unpublished: { unpublished: true },
	'media-not-ready': { mediaNotReady: true }
} as const satisfies Record<string, LessonListFilter>;

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const query = parseQuery(lessonListQuerySchema, event.url.searchParams);
	const filter: LessonListFilter = query.module
		? { moduleId: query.module }
		: query.filter
			? FILTERS[query.filter]
			: {};
	const { content } = event.locals.services;
	const [lessons, modules] = await Promise.all([
		content.lessons.list(filter),
		content.modules.list()
	]);
	return {
		lessons,
		modules: modules.map((module) => ({ id: module.id, title: module.title })),
		query
	};
};
