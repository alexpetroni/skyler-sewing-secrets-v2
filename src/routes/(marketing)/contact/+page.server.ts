import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { screenInput } from '#lib/server/http/submissions.ts';
import { fieldErrors } from '#lib/shared/schemas/auth.ts';
import { contactSchema } from '#lib/shared/schemas/marketing.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const { marketing } = event.locals.services;
		const form = await readForm(event.request);
		const values = {
			name: form.name ?? '',
			email: form.email ?? '',
			subject: form.subject ?? '',
			message: form.message ?? ''
		};

		const screened = await marketing.screen(screenInput(event, 'contact', form));
		switch (screened.outcome) {
			case 'rate_limited':
				return fail(429, {
					error: 'Too many messages. Please try again later.',
					values
				});
			case 'honeypot':
				// Look accepted to the bot; nothing is stored or sent.
				return { success: true };
			case 'challenge_failed':
				return fail(400, { error: 'Please complete the verification and try again.', values });
		}

		const parsed = v.safeParse(contactSchema, form);
		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.issues), values });
		}

		await marketing.contact.submit(parsed.output);
		return { success: true };
	}
};
