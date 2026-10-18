import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getAuth } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;

		// Validation
		if (!email) {
			return fail(400, {
				email,
				errors: { email: 'Email is required' }
			});
		}

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, {
				email,
				errors: { email: 'Please enter a valid email address' }
			});
		}

		// Better Auth looks the user up, mints the token and sends the email
		// through the configured Resend template. It reports success whether or
		// not the account exists, so this no longer leaks account existence.
		try {
			await getAuth().api.requestPasswordReset({
				body: {
					email: email.toLowerCase(),
					redirectTo: '/auth/reset-password'
				}
			});
		} catch (error) {
			console.error('[forgot-password] requestPasswordReset error:', error);
			return fail(400, {
				email,
				error: 'Failed to send reset email. Please try again.'
			});
		}

		return { success: true };
	}
};
