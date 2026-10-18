import { error } from '@sveltejs/kit';
import { modulePage } from '#lib/server/http/member-area.ts';
import type { PageServerLoad } from './$types';

// Public: anonymous visitors see the lessons with lock states, owners their progress.
export const load: PageServerLoad = async ({ locals, params }) => {
	const page = await modulePage(locals, params.moduleSlug);
	if (!page) error(404, 'Module not found');
	return page;
};
