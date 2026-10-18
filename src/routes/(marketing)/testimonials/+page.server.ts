import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { testimonials: await locals.services.marketing.testimonials.listPublished() };
};
