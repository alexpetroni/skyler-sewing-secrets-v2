import type { PageServerLoad } from './$types';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { blog_posts } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	try {
		const posts = await db.select().from(blog_posts).orderBy(desc(blog_posts.created_at));

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
