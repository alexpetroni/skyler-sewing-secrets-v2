import { redirect } from '@sveltejs/kit';
import { readForm } from '#lib/server/http/forms.ts';
import type { RequestHandler } from './$types';

const FAILED = '/auth/sign-in?error=oauth_failed';

export const POST: RequestHandler = async ({ request, locals }) => {
	const form = await readForm(request);
	if (form.provider !== 'google' || !locals.services.googleEnabled) {
		redirect(303, FAILED);
	}
	const redirectTo = form.redirectTo || '/library';

	let authUrl: string | undefined;
	try {
		// After Google redirects back to /api/auth/callback/google, Better Auth
		// forwards to /auth/redirect, which routes admins to /admin
		const result = await locals.services.auth.api.signInSocial({
			body: {
				provider: 'google',
				callbackURL: `/auth/redirect?to=${encodeURIComponent(redirectTo)}`,
				errorCallbackURL: FAILED
			},
			headers: request.headers
		});
		authUrl = result.url ?? undefined;
	} catch (err) {
		locals.services.logger.warn('signInSocial failed', {
			requestId: locals.requestId,
			error: err instanceof Error ? err.message : String(err)
		});
		redirect(303, FAILED);
	}

	if (authUrl) {
		redirect(303, authUrl, { external: true });
	}

	redirect(303, '/auth/sign-in');
};
