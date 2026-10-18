import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { totals } = await locals.services.content.outline();
	return { totals };
};
