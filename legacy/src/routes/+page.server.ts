import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { modules, lessons, testimonials, pricing_config } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getBunnyEmbedUrl } from '$lib/server/bunny';

// Free preview lesson shown on the homepage ("Mitred Corner")
const FREE_PREVIEW_VIDEO_URL = 'bunny:556030/cff89304-ef56-471a-8d50-690c5084974f';

export const load: PageServerLoad = async ({ locals }) => {
	// The hook decides maintenance mode (never set for active admins, so they
	// see the normal homepage) and serves this page as 503 when it is on.
	if (locals.maintenanceMode) {
		return { maintenance: true as const };
	}

	// Embed URL is built (and signed, when BUNNY_EMBED_TOKEN_KEY is set) on the server only
	const previewEmbedUrl = await getBunnyEmbedUrl(FREE_PREVIEW_VIDEO_URL);

	try {
		// Get published modules for preview with lessons
		const moduleRows = await db.query.modules.findMany({
			columns: {
				id: true,
				title: true,
				slug: true,
				description: true,
				thumbnail_url: true,
				order_index: true,
				is_published: true,
				is_bonus: true
			},
			with: {
				lessons: {
					columns: {
						id: true,
						lesson_type: true,
						duration_minutes: true,
						is_published: true
					},
					where: eq(lessons.is_published, true)
				}
			},
			where: eq(modules.is_published, true),
			orderBy: asc(modules.order_index)
		});

		// Get featured testimonials
		const testimonialRows = await db
			.select()
			.from(testimonials)
			.where(and(eq(testimonials.is_published, true), eq(testimonials.is_featured, true)))
			.orderBy(asc(testimonials.order_index))
			.limit(6);

		// Get active pricing
		const pricingRows = await db
			.select()
			.from(pricing_config)
			.where(eq(pricing_config.is_active, true))
			.limit(1);

		return {
			modules: moduleRows,
			testimonials: testimonialRows,
			pricing: pricingRows[0] ?? null,
			previewEmbedUrl,
			maintenance: false
		};
	} catch (err) {
		console.error('Failed to load homepage data:', err);
		return {
			modules: [],
			testimonials: [],
			pricing: null,
			previewEmbedUrl,
			maintenance: false
		};
	}
};
