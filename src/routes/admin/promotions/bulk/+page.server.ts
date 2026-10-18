import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { codesCsv } from '#lib/server/modules/commerce/index.ts';
import { bulkFormSchema } from '#lib/shared/schemas/commerce.ts';
import type { Actions, PageServerLoad } from './$types';

const form = adminForm(bulkFormSchema, { id: 'bulk' });

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
	generate: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await form.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			const rows = await event.locals.services.commerce.promo.bulkGenerate(parsed.data, user.id);
			return {
				form: parsed.form,
				generated: {
					prefix: parsed.data.prefix,
					codes: rows.map((row) => row.code),
					csv: codesCsv(rows)
				}
			};
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
	}
};
