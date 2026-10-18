import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAuth } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');

	// The token from the reset email is carried through the form and only
	// validated when the new password is submitted.
	if (!token) {
		redirect(303, '/auth/forgot-password');
	}

	return { token };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;
		const token = formData.get('token') as string;

		if (!token) {
			redirect(303, '/auth/forgot-password');
		}

		const errors: Record<string, string> = {};

		if (!password) {
			errors.password = 'Password is required';
		} else if (password.length < 8) {
			errors.password = 'Password must be at least 8 characters';
		}

		if (!confirmPassword) {
			errors.confirmPassword = 'Please confirm your password';
		} else if (password !== confirmPassword) {
			errors.confirmPassword = 'Passwords do not match';
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors });
		}

		try {
			await getAuth().api.resetPassword({
				body: { newPassword: password, token }
			});
		} catch (error) {
			console.error('[reset-password] resetPassword error:', error);
			return fail(400, {
				error: 'This reset link is invalid or has expired. Please request a new one.'
			});
		}

		return { success: true };
	}
};
