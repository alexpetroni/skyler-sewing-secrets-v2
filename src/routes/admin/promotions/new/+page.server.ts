import { redirect } from '@sveltejs/kit';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { promoFormSchema } from '#lib/shared/schemas/commerce.ts';
import type { Actions, PageServerLoad } from './$types';

const form = adminForm(promoFormSchema, { id: 'promo' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [products, empty] = await Promise.all([
		event.locals.services.catalog.listPublished(),
		form.empty()
	]);
	return {
		products: products.map(({ id, title, kind }) => ({ id, title, kind })),
		form: empty
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await form.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let id: string;
		try {
			id = (await event.locals.services.commerce.promo.create(parsed.data, user.id)).id;
		} catch (err) {
			return mapDomainError(parsed.form, err, { PROMO_CODE_TAKEN: 'code' });
		}
		redirect(303, `/admin/promotions/${id}`);
	}
};
