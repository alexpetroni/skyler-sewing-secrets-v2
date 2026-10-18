import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { faq_items } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	try {
		const faqs = await db
			.select()
			.from(faq_items)
			.where(eq(faq_items.is_published, true))
			.orderBy(asc(faq_items.category), asc(faq_items.order_index));

		return {
			faqs
		};
	} catch (err) {
		console.error('Failed to load FAQ items:', err);
		return {
			faqs: []
		};
	}
};
