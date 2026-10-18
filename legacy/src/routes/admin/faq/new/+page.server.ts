import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { faq_items } from '$lib/server/db/schema';
import { parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	let lastFaq;
	try {
		[lastFaq] = await db
			.select({ order_index: faq_items.order_index })
			.from(faq_items)
			.orderBy(desc(faq_items.order_index))
			.limit(1);
	} catch (err) {
		console.error('Failed to load next FAQ order index:', err);
	}

	const nextOrderIndex = (lastFaq?.order_index || 0) + 1;

	return {
		nextOrderIndex
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
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

		let faqId: string;
		try {
			const [created] = await db
				.insert(faq_items)
				.values({
					question,
					answer,
					category,
					order_index,
					is_published
				})
				.returning({ id: faq_items.id });
			faqId = created.id;
		} catch (err) {
			console.error('Failed to create FAQ:', err);
			return fail(500, { error: 'Failed to create FAQ' });
		}

		throw redirect(303, `/admin/faq/${faqId}`);
	}
};
