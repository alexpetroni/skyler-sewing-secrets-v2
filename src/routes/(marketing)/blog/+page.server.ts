import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { posts: await locals.services.marketing.blog.listPublished() };
};
