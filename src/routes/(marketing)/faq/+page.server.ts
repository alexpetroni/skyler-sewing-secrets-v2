import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { groups: await locals.services.marketing.faq.listPublished() };
};
