import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { fieldErrors, resetPasswordSchema } from '#lib/shared/schemas/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const token = url.searchParams.get('token');

	// The token from the reset email is carried through the form and only
	// validated when the new password is submitted.
	if (!token) {
		redirect(303, '/auth/forgot-password');
	}

	return { token };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await readForm(request);
		const token = form.token;
		if (!token) {
			redirect(303, '/auth/forgot-password');
		}

		const parsed = v.safeParse(resetPasswordSchema, form);
		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.issues) });
		}

		try {
			await locals.services.auth.api.resetPassword({
				body: { newPassword: parsed.output.password, token }
			});
		} catch {
			return fail(400, {
				error: 'This reset link is invalid or has expired. Please request a new one.'
			});
		}

		return { success: true };
	}
};
