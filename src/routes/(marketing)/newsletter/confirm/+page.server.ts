import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	const token = url.searchParams.get('token') ?? '';
	return { confirmed: await locals.services.marketing.newsletter.confirm(token) };
};
