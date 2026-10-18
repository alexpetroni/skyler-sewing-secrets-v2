import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { isDomainError } from '#lib/server/http/api.ts';
import { readForm } from '#lib/server/http/forms.ts';
import { safeRelativeTarget } from '#lib/server/http/redirects.ts';
import { isActiveAdmin } from '#lib/server/modules/auth/index.ts';
import { fieldErrors, twoFactorSignInSchema } from '#lib/shared/schemas/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const DEFAULT_TARGET = '/library';

/**
 * The second step of a sign-in for accounts with two-factor authentication:
 * Better Auth parked the sign-in behind its two-factor cookie, and a code
 * from the app (or a backup code) completes it. The redirect targets are the
 * sign-in page's.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	// Already signed in: nothing to complete.
	if (locals.user && locals.profile) {
		redirect(303, isActiveAdmin(locals.profile) ? '/admin' : DEFAULT_TARGET);
	}
	return { redirectTo: safeRelativeTarget(url.searchParams.get('redirectTo'), DEFAULT_TARGET) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await readForm(request);
		const parsed = v.safeParse(twoFactorSignInSchema, form);
		if (!parsed.success) {
			return fail(400, { method: form.method ?? 'totp', errors: fieldErrors(parsed.issues) });
		}
		const { code, method, redirectTo } = parsed.output;

		let userId: string;
		try {
			userId = await locals.services.twoFactor.completeSignIn({
				code,
				method,
				headers: request.headers
			});
		} catch (err) {
			if (!isDomainError(err)) throw err;
			return fail(400, { method, error: err.message });
		}
		await locals.services.users.trimSessions(userId, 5);

		// A suspended admin is not an admin: they land like everyone else.
		const profile = await locals.services.users.getProfile(userId);
		if (isActiveAdmin(profile)) redirect(303, '/admin');
		redirect(303, safeRelativeTarget(redirectTo, DEFAULT_TARGET));
	}
};
