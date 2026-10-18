import type { PageServerLoad } from './$types';

/** Featured testimonials shown on the homepage, as legacy. */
const FEATURED_TESTIMONIALS = 6;

export const load: PageServerLoad = async ({ locals }) => {
	// The hook decides maintenance mode (never for active admins) and serves
	// this page as 503 while it is on.
	if (locals.maintenanceMode) {
		return { maintenance: true as const };
	}

	const { content, marketing, catalog, videoHost } = locals.services;
	const [outline, testimonials, courses, preview] = await Promise.all([
		content.outline(),
		marketing.testimonials.featured(FEATURED_TESTIMONIALS),
		catalog.listPublished({ kind: 'course' }),
		content.freePreviewLesson()
	]);
	const flagship = courses.find((product) => product.access_scope === 'all') ?? null;

	// Signed on the server; the lesson is free, so no access check applies.
	const freePreview = preview && {
		title: preview.lesson.title,
		description: preview.lesson.description,
		embedUrl: preview.asset
			? await videoHost.embedUrl({
					libraryId: preview.asset.library_id,
					videoId: preview.asset.video_id
				})
			: null
	};

	return { maintenance: false as const, outline, testimonials, flagship, freePreview };
};
