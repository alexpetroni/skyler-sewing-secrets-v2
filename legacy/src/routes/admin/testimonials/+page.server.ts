import type { PageServerLoad } from './$types';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { testimonials } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	try {
		const testimonialRows = await db.select().from(testimonials).orderBy(asc(testimonials.order_index));

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
