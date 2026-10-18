import { redirect } from '@sveltejs/kit';
import { safeRelativeTarget } from '#lib/server/http/redirects.ts';
import { isActiveAdmin } from '#lib/server/modules/auth/index.ts';
import type { RequestHandler } from './$types';

/**
 * Post-login router, used as the OAuth callbackURL: admins go to the panel,
 * everyone else to the (same-origin) `to` target.
 */
export const GET: RequestHandler = ({ url, locals }) => {
	if (!locals.user) {
		redirect(303, '/auth/sign-in');
	}

	// A suspended admin is not an admin: never route them to the panel
	if (isActiveAdmin(locals.profile)) {
		redirect(303, '/admin');
	}

	redirect(303, safeRelativeTarget(url.searchParams.get('to')));
};
