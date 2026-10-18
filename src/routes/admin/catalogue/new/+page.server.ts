import { redirect } from '@sveltejs/kit';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { parseQuery, productNewQuerySchema } from '#lib/shared/schemas/admin.ts';
import { productCreateSchema } from '#lib/shared/schemas/catalog.ts';
import type { Actions, PageServerLoad } from './$types';

const form = adminForm(productCreateSchema, { id: 'product' });

/** Field each refusal belongs to; the rest are shown above the form. */
const errorFields = { SLUG_TAKEN: 'slug', LESSON_NOT_FOUND: 'lessonId' };

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { kind, lesson: lessonId } = parseQuery(productNewQuerySchema, event.url.searchParams);
	const [lesson, empty] = await Promise.all([
		lessonId ? event.locals.services.content.lessons.getById(lessonId) : null,
		form.empty()
	]);
	return {
		kind,
		lesson: lesson ? { id: lesson.id, title: lesson.title } : null,
		form: empty
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await form.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		const { lessonId, ...input } = parsed.data;
		let id: string;
		try {
			const product = await event.locals.services.catalog.create(
				input,
				user.id,
				lessonId ? [lessonId] : undefined
			);
			id = product.id;
		} catch (err) {
			return mapDomainError(parsed.form, err, errorFields);
		}
		redirect(303, `/admin/catalogue/${id}`);
	}
};
