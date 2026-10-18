import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isActiveAdmin } from '$lib/server/access';
import { safeRelativeTarget } from '$lib/server/redirects';

/**
 * Post-login router, used as the OAuth callbackURL. Replaces the role-based
 * redirect the old Supabase /auth/callback handler performed.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		redirect(303, '/auth/sign-in');
	}

	// A suspended admin is not an admin: never route them to the panel
	if (isActiveAdmin(locals.profile)) {
		redirect(303, '/admin');
	}

	redirect(303, safeRelativeTarget(url.searchParams.get('to')));
};
