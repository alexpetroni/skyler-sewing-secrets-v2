import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { keyFor } from '#lib/server/platform/request-limits.ts';
import { fieldErrors, forgotPasswordSchema } from '#lib/shared/schemas/auth.ts';
import type { Actions } from './$types';

// `auth.api.requestPasswordReset` bypasses Better Auth's HTTP rate limiter, so
// the action counts requests per address itself (security audit H5).
const LIMIT = { max: 5, windowSeconds: 15 * 60 };
const TOO_MANY_REQUESTS = 'Too many reset requests. Please wait a few minutes and try again.';

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		const form = await readForm(request);
		const parsed = v.safeParse(forgotPasswordSchema, form);
		if (!parsed.success) {
			return fail(400, { email: form.email ?? '', errors: fieldErrors(parsed.issues) });
		}
		const email = parsed.output.email.toLowerCase();

		const limit = await locals.services.limiter.consume(keyFor('forgot-password', event), LIMIT);
		if (!limit.allowed) return fail(429, { email, error: TOO_MANY_REQUESTS });

		// Better Auth looks the user up, mints the token and sends the email. It
		// reports success whether or not the account exists, so this does not
		// leak account existence.
		try {
			await locals.services.auth.api.requestPasswordReset({
				body: { email, redirectTo: '/auth/reset-password' }
			});
		} catch (err) {
			locals.services.logger.warn('requestPasswordReset failed', {
				requestId: locals.requestId,
				error: err instanceof Error ? err.message : String(err)
			});
			return fail(400, { email, error: 'Failed to send reset email. Please try again.' });
		}

		return { success: true };
	}
};
