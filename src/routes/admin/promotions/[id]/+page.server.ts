import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { promoStatus } from '#lib/server/modules/commerce/index.ts';
import { confirmDeleteSchema, emptyActionSchema } from '#lib/shared/schemas/admin.ts';
import { promoFormSchema } from '#lib/shared/schemas/commerce.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	update: adminForm(promoFormSchema, { id: 'promo' }),
	active: adminForm(emptyActionSchema, { id: 'active' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The code the page is about; anything but a uuid is a 404. */
function promoId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Promotion not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = promoId(event);
	const { catalog, commerce } = event.locals.services;
	const [promo, redemptions, products, update, active, remove] = await Promise.all([
		commerce.promo.getById(id),
		commerce.promo.listRedemptions(id),
		catalog.listAll(),
		forms.update.empty(),
		forms.active.empty(),
		forms.remove.empty()
	]);
	if (!promo) error(404, 'Promotion not found');
	return {
		promo: { ...promo, status: promoStatus(promo, new Date()) },
		redemptions,
		// Published products, and any unpublished one the scope still names.
		products: products
			.filter((product) => product.is_published || promo.productIds.includes(product.id))
			.map(({ id, title, kind }) => ({ id, title, kind })),
		forms: { update, active, remove }
	};
};

/** `setActive` behind the activate / deactivate buttons. */
async function setActive(event: RequestEvent, active: boolean) {
	const { user } = requireAdmin(event);
	const id = promoId(event);
	const parsed = await forms.active.parse(event.request);
	if (!parsed.ok) return parsed.failure;
	try {
		await event.locals.services.commerce.promo.setActive(id, active, user.id);
	} catch (err) {
		return mapDomainError(parsed.form, err);
	}
	return message(parsed.form, active ? 'Code activated.' : 'Code deactivated.');
}

export const actions: Actions = {
	update: async (event) => {
		const { user } = requireAdmin(event);
		const id = promoId(event);
		const parsed = await forms.update.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.commerce.promo.update(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err, { PROMO_CODE_TAKEN: 'code' });
		}
		return message(parsed.form, 'Promotion saved.');
	},

	activate: (event) => setActive(event, true),

	deactivate: (event) => setActive(event, false),

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = promoId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.commerce.promo.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/promotions');
	}
};
