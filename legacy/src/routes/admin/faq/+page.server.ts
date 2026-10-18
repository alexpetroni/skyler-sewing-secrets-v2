import type { PageServerLoad } from './$types';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { faq_items } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	try {
		const faqs = await db
			.select()
			.from(faq_items)
			.orderBy(asc(faq_items.category), asc(faq_items.order_index));

		return {
			faqs
		};
	} catch (err) {
		console.error('Failed to load FAQs:', err);
		return {
			faqs: []
		};
	}
};
