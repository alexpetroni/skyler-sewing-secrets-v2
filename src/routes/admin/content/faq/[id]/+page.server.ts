import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { confirmDeleteSchema, faqItemSchema } from '#lib/shared/schemas/admin.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	update: adminForm(faqItemSchema, { id: 'faq' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The FAQ item the page is about; anything but a uuid is a 404. */
function faqId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'FAQ not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = faqId(event);
	const [faq, update, remove] = await Promise.all([
		event.locals.services.marketing.faq.getById(id),
		forms.update.empty(),
		forms.remove.empty()
	]);
	if (!faq) error(404, 'FAQ not found');
	return { faq, forms: { update, remove } };
};

export const actions: Actions = {
	update: async (event) => {
		const { user } = requireAdmin(event);
		const id = faqId(event);
		const parsed = await forms.update.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.faq.update(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'FAQ updated successfully.');
	},

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = faqId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.faq.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/content/faq');
	}
};
