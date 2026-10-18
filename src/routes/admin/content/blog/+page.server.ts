import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const posts = await event.locals.services.marketing.blog.listAll();
	return {
		posts: posts.map((post) => ({
			id: post.id,
			title: post.title,
			slug: post.slug,
			featured_image_url: post.featured_image_url,
			is_published: post.is_published,
			published_at: post.published_at
		}))
	};
};
