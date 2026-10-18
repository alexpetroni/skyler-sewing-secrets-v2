import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { PUBLISH_CONDITION_LABELS } from '#lib/server/modules/catalog/index.ts';
import { promoStatus } from '#lib/server/modules/commerce/index.ts';
import { confirmDeleteSchema } from '#lib/shared/schemas/admin.ts';
import {
	productBasicsSchema,
	productContentsSchemas,
	productPricingSchema,
	productVisibilitySchema
} from '#lib/shared/schemas/catalog.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

/** One form per section, so each saves on its own. */
const forms = {
	basics: adminForm(productBasicsSchema, { id: 'basics' }),
	contents: {
		course: adminForm(productContentsSchemas.course, { id: 'contents' }),
		bundle: adminForm(productContentsSchemas.bundle, { id: 'contents' }),
		single: adminForm(productContentsSchemas.single, { id: 'contents' })
	},
	pricing: adminForm(productPricingSchema, { id: 'pricing' }),
	visibility: adminForm(productVisibilitySchema, { id: 'visibility' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The product the page is about; anything but a uuid is a 404. */
function productId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Product not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = productId(event);
	const { catalog, commerce } = event.locals.services;
	const product = await catalog.getById(id);
	if (!product) error(404, 'Product not found');
	const [lessons, unmet, promotions, basics, contents, pricing, visibility, remove] =
		await Promise.all([
			catalog.pickerLessons(product.items.map((item) => item.lesson_id)),
			catalog.publishChecklist(id),
			commerce.promo.listForProduct(id),
			forms.basics.empty(),
			forms.contents[product.kind].empty(),
			forms.pricing.empty(),
			forms.visibility.empty(),
			forms.remove.empty()
		]);
	const now = new Date();
	return {
		product,
		lessons,
		checklist: unmet.map((condition) => PUBLISH_CONDITION_LABELS[condition]),
		promotions: promotions.map((code) => ({
			id: code.id,
			code: code.code,
			discountType: code.discount_type,
			discountValue: code.discount_value,
			status: promoStatus(code, now)
		})),
		forms: { basics, contents, pricing, visibility, remove }
	};
};

export const actions: Actions = {
	basics: async (event) => {
		const { user } = requireAdmin(event);
		const id = productId(event);
		const parsed = await forms.basics.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.catalog.updateFields(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err, { SLUG_TAKEN: 'slug' });
		}
		return message(parsed.form, 'Basics saved.');
	},

	contents: async (event) => {
		const { user } = requireAdmin(event);
		const id = productId(event);
		const { catalog } = event.locals.services;
		const product = await catalog.getById(id);
		if (!product) error(404, 'Product not found');
		// The kind decides the item rule, so it picks the schema.
		const parsed = await forms.contents[product.kind].parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await catalog.setItems(id, parsed.data.lessonIds, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err, {
				INVALID_ITEMS: 'lessonIds',
				LESSON_NOT_FOUND: 'lessonIds'
			});
		}
		return message(parsed.form, 'Contents saved.');
	},

	pricing: async (event) => {
		const { user } = requireAdmin(event);
		const id = productId(event);
		const parsed = await forms.pricing.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.catalog.updateFields(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Pricing saved.');
	},

	visibility: async (event) => {
		const { user } = requireAdmin(event);
		const id = productId(event);
		const parsed = await forms.visibility.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.catalog.setVisibility(id, parsed.data, user.id);
		} catch (err) {
			// `PUBLISH_BLOCKED` carries the unmet checklist items in its message.
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Visibility saved.');
	},

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = productId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.catalog.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/catalogue');
	}
};
