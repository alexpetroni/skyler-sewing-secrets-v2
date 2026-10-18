import type { RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { moveModuleSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const moveForm = adminForm(moveModuleSchema, { id: 'move' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [modules, move] = await Promise.all([
		event.locals.services.content.modules.listWithLessonCounts(),
		moveForm.empty()
	]);
	return { modules, forms: { move } };
};

function move(direction: 'up' | 'down') {
	return async (event: RequestEvent) => {
		const { user } = requireAdmin(event);
		const parsed = await moveForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.modules.move(parsed.data.id, direction, user.id);
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
