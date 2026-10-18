import { error, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { emptyActionSchema, orderNoteSchema } from '#lib/shared/schemas/admin.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	rerunFulfilment: adminForm(emptyActionSchema, { id: 'rerunFulfilment' }),
	addNote: adminForm(orderNoteSchema, { id: 'addNote' })
};

/** The order the page is about; anything but a uuid is a 404. */
function targetId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Order not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const detail = await event.locals.services.admin.orders.detail(targetId(event));
	if (!detail) error(404, 'Order not found');
	const [rerunFulfilment, addNote] = await Promise.all([
		forms.rerunFulfilment.empty(),
		forms.addNote.empty()
	]);
	return { detail, forms: { rerunFulfilment, addNote } };
};

export const actions: Actions = {
	rerunFulfilment: async (event) => {
		const { user } = requireAdmin(event);
		const orderId = targetId(event);
		const parsed = await forms.rerunFulfilment.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let alreadyFulfilled: boolean;
		try {
			const result = await event.locals.services.admin.orders.rerunFulfilment(orderId, user.id);
			alreadyFulfilled = 'alreadyFulfilled' in result;
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(
			parsed.form,
			alreadyFulfilled ? 'Already fulfilled; nothing changed.' : 'Order fulfilled.'
		);
	},

	addNote: async (event) => {
		const { user } = requireAdmin(event);
		const orderId = targetId(event);
		const parsed = await forms.addNote.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.admin.orders.addNote(orderId, parsed.data.note, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Note saved.');
	}
};
