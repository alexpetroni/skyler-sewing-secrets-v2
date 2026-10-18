import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { blog_posts } from '$lib/server/db/schema';
import { isHttpsUrl } from '$lib/server/validation';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();

		const title = formData.get('title')?.toString().trim() || '';
		const slug = formData.get('slug')?.toString().trim() || '';
		const excerpt = formData.get('excerpt')?.toString().trim() || null;
		const featured_image_url = formData.get('featured_image_url')?.toString().trim() || null;
		const content = formData.get('content')?.toString().trim() || '';
		const is_published = formData.get('is_published') === 'on';

		const errors: Record<string, string> = {};

		if (!title) errors.title = 'Title is required';
		if (!slug) errors.slug = 'Slug is required';
		if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = 'Slug must be lowercase letters, numbers, and hyphens only';
		if (!content) errors.content = 'Content is required';
		if (featured_image_url && !isHttpsUrl(featured_image_url)) errors.featured_image_url = 'Must be an https:// URL';

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors });
		}

		// Check for duplicate slug
		let existing;
		try {
			[existing] = await db.select({ id: blog_posts.id }).from(blog_posts).where(eq(blog_posts.slug, slug)).limit(1);
		} catch (err) {
			console.error('Failed to check blog post slug:', err);
		}

		if (existing) {
			return fail(400, { errors: { slug: 'This slug is already in use' } as Record<string, string> });
		}

		// Create post
		let postId: string;
		try {
			const [created] = await db
				.insert(blog_posts)
				.values({
					title,
					slug,
					excerpt,
					featured_image_url,
					content,
					is_published,
					published_at: is_published ? new Date().toISOString() : null,
					author_id: locals.user?.id
				})
				.returning({ id: blog_posts.id });
			postId = created.id;
		} catch (err) {
			console.error('Failed to create post:', err);
			return fail(500, { error: 'Failed to create post' });
		}

		throw redirect(303, `/admin/blog/${postId}`);
	}
};
