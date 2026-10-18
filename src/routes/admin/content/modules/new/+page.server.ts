import { redirect } from '@sveltejs/kit';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { moduleInputSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const moduleForm = adminForm(moduleInputSchema, { id: 'module' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [modules, form] = await Promise.all([
		event.locals.services.content.modules.list(),
		moduleForm.empty()
	]);
	// New modules go last unless the admin says otherwise.
	const nextOrderIndex = modules.reduce((max, module) => Math.max(max, module.order_index + 1), 0);
	return { nextOrderIndex, form };
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await moduleForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let moduleId: string;
		try {
			moduleId = (await event.locals.services.content.modules.create(parsed.data, user.id)).id;
		} catch (err) {
			return mapDomainError(parsed.form, err, { SLUG_TAKEN: 'slug' });
		}
		redirect(303, `/admin/content/modules/${moduleId}`);
	}
};
