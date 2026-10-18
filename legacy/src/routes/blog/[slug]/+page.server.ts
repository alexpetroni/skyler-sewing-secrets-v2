import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { blog_posts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	let post: typeof blog_posts.$inferSelect | null = null;

	try {
		const rows = await db
			.select()
			.from(blog_posts)
			.where(and(eq(blog_posts.slug, params.slug), eq(blog_posts.is_published, true)))
			.limit(1);

		post = rows[0] ?? null;
	} catch (err) {
		console.error('Failed to load blog post:', err);
	}

	if (!post) {
		throw error(404, 'Post not found');
	}

	return {
		post
	};
};
