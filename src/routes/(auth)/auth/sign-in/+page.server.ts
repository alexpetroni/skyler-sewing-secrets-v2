import { fail, isRedirect, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { safeRelativeTarget } from '#lib/server/http/redirects.ts';
import { isActiveAdmin } from '#lib/server/modules/auth/index.ts';
import { fieldErrors, signInSchema } from '#lib/shared/schemas/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const DEFAULT_TARGET = '/library';

function isTwoFactorRedirect(result: unknown): boolean {
	return (
		typeof result === 'object' &&
		result !== null &&
		(result as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
	);
}

export const load: PageServerLoad = async ({ locals, url, request }) => {
	const { auth, logger } = locals.services;

	// A session without a profile is stale: sign it out to clear the cookies.
	if (locals.user && !locals.profile) {
		try {
			await auth.api.signOut({ headers: request.headers });
		} catch (err) {
			logger.warn('failed to clear stale session', {
				requestId: locals.requestId,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}

	// Already signed in with a valid profile. A suspended admin is not an
	// admin: never route them to the panel.
	if (locals.user && locals.profile) {
		if (isActiveAdmin(locals.profile)) {
			redirect(303, '/admin');
		} else if (locals.access.allAccess) {
			redirect(303, DEFAULT_TARGET);
		}
	}

	return {
		redirectTo: safeRelativeTarget(url.searchParams.get('redirectTo'), DEFAULT_TARGET),
		googleEnabled: locals.services.googleEnabled
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await readForm(request);
		const parsed = v.safeParse(signInSchema, form);
		if (!parsed.success) {
			return fail(400, { email: form.email ?? '', errors: fieldErrors(parsed.issues) });
		}
		const { email, password, redirectTo } = parsed.output;

		// The session cookie is set through the sveltekitCookies plugin.
		let userId: string;
		try {
			const result: unknown = await locals.services.auth.api.signInEmail({
				body: { email, password },
				headers: request.headers
			});
			// Two-factor accounts get no session yet: Better Auth parked the
			// sign-in behind its two-factor cookie and the code completes it.
			if (isTwoFactorRedirect(result)) {
				redirect(303, `/auth/two-factor?redirectTo=${encodeURIComponent(redirectTo)}`);
			}
			userId = (result as { user: { id: string } }).user.id;
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(400, { email, error: 'Invalid email or password' });
		}
		await locals.services.users.trimSessions(userId, 5);

		// A suspended admin is not an admin: they land like everyone else.
		const profile = await locals.services.users.getProfile(userId);
		if (isActiveAdmin(profile)) {
			redirect(303, '/admin');
		}
		redirect(303, safeRelativeTarget(redirectTo, DEFAULT_TARGET));
	}
};
