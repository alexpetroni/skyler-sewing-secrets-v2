import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { faq_items } from '$lib/server/db/schema';
import { isUuid, parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	// A non-UUID id is a mistyped URL, not a Postgres error
	if (!isUuid(params.id)) {
		throw error(404, 'FAQ not found');
	}

	let faq;
	try {
		[faq] = await db.select().from(faq_items).where(eq(faq_items.id, params.id)).limit(1);
	} catch (err) {
		console.error('Failed to load FAQ:', err);
	}

	if (!faq) {
		throw error(404, 'FAQ not found');
	}

	return {
		faq
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'FAQ not found');
		}

		const formData = await request.formData();

		const question = formData.get('question')?.toString().trim() || '';
		const answer = formData.get('answer')?.toString().trim() || '';
		const category = formData.get('category')?.toString().trim() || null;
		const orderIndex = parseIntField(formData.get('order_index'), { min: 0, fallback: 1 });
		const is_published = formData.get('is_published') === 'on';

		const errors: Record<string, string> = {};

		if (!question) errors.question = 'Question is required';
		if (!answer) errors.answer = 'Answer is required';
		if (!orderIndex.ok) errors.order_index = orderIndex.error;

		if (Object.keys(errors).length > 0 || !orderIndex.ok) {
			return fail(400, { errors });
		}

		const order_index = orderIndex.value ?? 1;

		try {
			await db
				.update(faq_items)
				.set({
					question,
					answer,
					category,
					order_index,
					is_published,
					updated_at: new Date().toISOString()
				})
				.where(eq(faq_items.id, params.id));
		} catch (err) {
			console.error('Failed to update FAQ:', err);
			return fail(500, { error: 'Failed to update FAQ' });
		}

		return { success: true };
	},

	delete: async ({ params }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'FAQ not found');
		}

		try {
			await db.delete(faq_items).where(eq(faq_items.id, params.id));
		} catch (err) {
			console.error('Failed to delete FAQ:', err);
			return fail(500, { error: 'Failed to delete FAQ' });
		}

		throw redirect(303, '/admin/faq');
	}
};
