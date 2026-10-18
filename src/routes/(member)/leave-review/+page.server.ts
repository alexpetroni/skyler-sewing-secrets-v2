import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { requireActiveMember } from '#lib/server/modules/auth/index.ts';
import { DomainError } from '#lib/server/modules/errors.ts';
import { reviewSchema } from '#lib/shared/schemas/marketing.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// Sign-in redirect, 403 for suspended accounts, catalogue for owners of nothing.
	const { user } = await requireActiveMember(event, '/leave-review');
	return { testimonial: await event.locals.services.marketing.testimonials.forUser(user.id) };
};

export const actions: Actions = {
	submit: async (event) => {
		const { user } = await requireActiveMember(event, '/leave-review');
		const form = await readForm(event.request);
		const values = {
			content: form.content ?? '',
			rating: form.rating ?? '',
			authorTitle: form.author_title ?? ''
		};

		const parsed = v.safeParse(reviewSchema, form);
		if (!parsed.success) return fail(400, { error: parsed.issues[0].message, values });

		try {
			await event.locals.services.marketing.testimonials.submit({
				userId: user.id,
				content: parsed.output.content,
				rating: parsed.output.rating,
				authorTitle: parsed.output.author_title
			});
		} catch (err) {
			if (err instanceof DomainError && err.code === 'REVIEW_PUBLISHED') {
				return fail(400, { error: err.message, values });
			}
			throw err;
		}

		redirect(303, '/profile?review=submitted');
	}
};
