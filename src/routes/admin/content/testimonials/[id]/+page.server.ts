import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { confirmDeleteSchema, testimonialSchema } from '#lib/shared/schemas/admin.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	update: adminForm(testimonialSchema, { id: 'testimonial' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The testimonial the page is about; anything but a uuid is a 404. */
function testimonialId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Testimonial not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = testimonialId(event);
	const [testimonial, update, remove] = await Promise.all([
		event.locals.services.marketing.testimonials.getById(id),
		forms.update.empty(),
		forms.remove.empty()
	]);
	if (!testimonial) error(404, 'Testimonial not found');
	return { testimonial, forms: { update, remove } };
};

export const actions: Actions = {
	update: async (event) => {
		const { user } = requireAdmin(event);
		const id = testimonialId(event);
		const parsed = await forms.update.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.testimonials.update(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Testimonial updated successfully.');
	},

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = testimonialId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.testimonials.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/content/testimonials');
	}
};
