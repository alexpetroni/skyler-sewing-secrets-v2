import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	// Unpublished and unknown slugs look the same from outside.
	const post = await locals.services.marketing.blog.getPublishedBySlug(params.slug);
	if (!post) error(404, 'Post not found');
	return { post };
};
