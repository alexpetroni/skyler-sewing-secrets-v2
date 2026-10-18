import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Require authentication
	if (!locals.user) {
		redirect(303, '/auth/sign-in?redirectTo=/admin');
	}

	// Require admin privileges
	if (!locals.profile?.is_admin) {
		redirect(303, '/');
	}

	return {
		profile: locals.profile
	};
};
