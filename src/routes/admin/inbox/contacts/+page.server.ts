import { message } from 'sveltekit-superforms/server';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { rowActionSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const readForm = adminForm(rowActionSchema, { id: 'read' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [contacts, read] = await Promise.all([
		event.locals.services.marketing.contact.list(),
		readForm.empty()
	]);
	return { contacts, forms: { read } };
};

export const actions: Actions = {
	markRead: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await readForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.contact.markRead(parsed.data.id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Marked as read.');
	}
};
