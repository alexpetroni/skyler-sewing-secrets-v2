import type { RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { rowActionSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const moveForm = adminForm(rowActionSchema, { id: 'move' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [faqs, move] = await Promise.all([
		event.locals.services.marketing.faq.listAll(),
		moveForm.empty()
	]);
	return {
		faqs: faqs.map((faq) => ({
			id: faq.id,
			question: faq.question,
			category: faq.category,
			order_index: faq.order_index,
			is_published: faq.is_published
		})),
		forms: { move }
	};
};

function move(direction: 'up' | 'down') {
	return async (event: RequestEvent) => {
		const { user } = requireAdmin(event);
		const parsed = await moveForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.faq.move(parsed.data.id, direction, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Order saved.');
	};
}

export const actions: Actions = {
	moveUp: move('up'),
	moveDown: move('down')
};
