import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { testimonials } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	try {
		const testimonialRows = await db
			.select()
			.from(testimonials)
			.where(eq(testimonials.is_published, true))
			.orderBy(asc(testimonials.order_index));

		return {
			testimonials: testimonialRows
		};
	} catch (err) {
		console.error('Failed to load testimonials:', err);
		return {
			testimonials: []
		};
	}
};
