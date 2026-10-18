import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { blog_posts } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	try {
		const posts = await db
			.select({
				id: blog_posts.id,
				title: blog_posts.title,
				slug: blog_posts.slug,
				excerpt: blog_posts.excerpt,
				featured_image_url: blog_posts.featured_image_url,
				published_at: blog_posts.published_at,
				created_at: blog_posts.created_at
			})
			.from(blog_posts)
			.where(eq(blog_posts.is_published, true))
			.orderBy(desc(blog_posts.published_at));

		return {
			posts
		};
	} catch (err) {
		console.error('Failed to load blog posts:', err);
		return {
			posts: []
		};
	}
};
