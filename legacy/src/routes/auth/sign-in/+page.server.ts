import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { isActiveAdmin } from '$lib/server/access';
import { getAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { profiles } from '$lib/server/db/schema';
import { safeRelativeTarget } from '$lib/server/redirects';

export const load: PageServerLoad = async ({ locals, url, request }) => {
	// If user has a session but no profile, sign them out to clear stale cookies
	if (locals.user && !locals.profile) {
		try {
			await getAuth().api.signOut({ headers: request.headers });
		} catch (error) {
			console.error('[sign-in] Failed to clear stale session:', error);
		}
	}

	// Redirect if already logged in with a valid profile
	if (locals.user && locals.profile) {
		// A suspended admin is not an admin: never route them to the panel
		if (isActiveAdmin(locals.profile)) {
			redirect(303, '/admin');
		} else if (locals.profile.is_member) {
			redirect(303, '/dashboard');
		}
	}

	return {
		redirectTo: url.searchParams.get('redirectTo') || '/dashboard'
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const redirectTo = (formData.get('redirectTo') as string) || '/dashboard';

		// Validation
		const errors: Record<string, string> = {};

		if (!email) {
			errors.email = 'Email is required';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errors.email = 'Please enter a valid email address';
		}

		if (!password) {
			errors.password = 'Password is required';
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { email, errors });
		}

		// Attempt sign in (session cookie is set via the sveltekitCookies plugin)
		let userId: string;
		try {
			const result = await getAuth().api.signInEmail({
				body: { email, password },
				headers: request.headers
			});
			userId = result.user.id;
		} catch {
			return fail(400, {
				email,
				error: 'Invalid email or password'
			});
		}

		// Check if user is an active admin to redirect appropriately (a
		// suspended admin is not an admin)
		const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);

		if (isActiveAdmin(profile)) {
			redirect(303, '/admin');
		}

		redirect(303, safeRelativeTarget(redirectTo));
	}
};
