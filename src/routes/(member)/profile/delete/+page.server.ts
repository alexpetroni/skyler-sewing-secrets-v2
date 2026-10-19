import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { isDomainError } from '#lib/server/http/api.ts';
import { readForm } from '#lib/server/http/forms.ts';
import { requireUser } from '#lib/server/modules/auth/index.ts';
import { DELETE_ACCOUNT_PHRASE, deleteAccountSchema } from '#lib/shared/schemas/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const WRONG_PASSWORD = 'Incorrect password';
const WRONG_PHRASE = 'Type the phrase exactly to confirm';

/**
 * Self-service GDPR deletion. A credential account confirms with its
 * password; a Google-only account (no password to check, no re-auth
 * available here) types the phrase. `?done=1` is the goodbye page.
 */
export const load: PageServerLoad = async (event) => {
	if (event.url.searchParams.has('done'))
		return { done: true, hasPassword: false, phrase: DELETE_ACCOUNT_PHRASE };
	const { user } = requireUser(event, '/profile/delete');
	return {
		done: false,
		hasPassword: await event.locals.services.users.hasPassword(user.id),
		phrase: DELETE_ACCOUNT_PHRASE
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { user } = requireUser(event, '/profile/delete');
		const { users, auth, logger } = event.locals.services;
		const parsed = v.safeParse(deleteAccountSchema, await readForm(event.request));
		if (!parsed.success) return fail(400, { error: WRONG_PHRASE });

		if (await users.hasPassword(user.id)) {
			if (!(await users.verifyPassword(user.id, parsed.output.password))) {
				return fail(400, { error: WRONG_PASSWORD });
			}
		} else if (parsed.output.confirm.toLowerCase() !== DELETE_ACCOUNT_PHRASE) {
			return fail(400, { error: WRONG_PHRASE });
		}

		// A refusal (an admin account) must leave the member signed in, so the
		// anonymisation runs first; it deletes every session row, and the
		// sign-out afterwards only clears this browser's cookie.
		try {
			await users.anonymise(user.id, user.id);
		} catch (err) {
			if (!isDomainError(err)) throw err;
			return fail(400, { error: err.message });
		}
		try {
			await auth.api.signOut({ headers: event.request.headers });
		} catch (err) {
			logger.warn('sign-out after account deletion failed', {
				requestId: event.locals.requestId,
				error: err instanceof Error ? err.message : String(err)
			});
		}
		redirect(303, '/profile/delete?done=1');
	}
};
