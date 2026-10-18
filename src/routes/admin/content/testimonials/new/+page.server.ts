import { redirect } from '@sveltejs/kit';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { testimonialSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const testimonialForm = adminForm(testimonialSchema, { id: 'testimonial' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return { form: await testimonialForm.empty() };
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await testimonialForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let testimonialId: string;
		try {
			testimonialId = (
				await event.locals.services.marketing.testimonials.create(parsed.data, user.id)
			).id;
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, `/admin/content/testimonials/${testimonialId}`);
	}
};
