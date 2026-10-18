import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { confirmDeleteSchema } from '#lib/shared/schemas/admin.ts';
import { idSchema, moduleInputSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	update: adminForm(moduleInputSchema, { id: 'module' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The module the page is about; anything but a uuid is a 404. */
function moduleId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Module not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = moduleId(event);
	const { content } = event.locals.services;
	const [module, lessons, update, remove] = await Promise.all([
		content.modules.getById(id),
		content.lessons.listByModule(id),
		forms.update.empty(),
		forms.remove.empty()
	]);
	if (!module) error(404, 'Module not found');
	return { module, lessons, forms: { update, remove } };
};

export const actions: Actions = {
	update: async (event) => {
		const { user } = requireAdmin(event);
		const id = moduleId(event);
		const parsed = await forms.update.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.modules.update(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err, { SLUG_TAKEN: 'slug' });
		}
		return message(parsed.form, 'Module updated successfully.');
	},

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = moduleId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.modules.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/content/modules');
	}
};
