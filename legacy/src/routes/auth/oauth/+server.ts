import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const provider = formData.get('provider') as 'google';
	const redirectTo = (formData.get('redirectTo') as string) || '/dashboard';

	let authUrl: string | undefined;
	try {
		// After Google redirects back to /api/auth/callback/google, Better Auth
		// forwards to /auth/redirect, which routes admins to /admin
		const result = await getAuth().api.signInSocial({
			body: {
				provider,
				callbackURL: `/auth/redirect?to=${encodeURIComponent(redirectTo)}`,
				errorCallbackURL: '/auth/sign-in?error=oauth_failed'
			},
			headers: request.headers
		});
		authUrl = result.url ?? undefined;
	} catch (error) {
		console.error('[oauth] signInSocial error:', error);
		redirect(303, '/auth/sign-in?error=oauth_failed');
	}

	if (authUrl) {
		redirect(303, authUrl);
	}

	redirect(303, '/auth/sign-in');
};
