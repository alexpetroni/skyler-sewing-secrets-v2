import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// A visual check of the design-system port for `npm run dev`; it does not exist in production.
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
