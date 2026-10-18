import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { modules } from '$lib/server/db/schema';
import { isHttpsUrl, parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	// Get next order index
	let lastModule;
	try {
		[lastModule] = await db
			.select({ order_index: modules.order_index })
			.from(modules)
			.orderBy(desc(modules.order_index))
			.limit(1);
	} catch (err) {
		console.error('Failed to load next module order index:', err);
	}

	const nextOrderIndex = (lastModule?.order_index || 0) + 1;

	return {
		nextOrderIndex
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();

		const title = formData.get('title')?.toString().trim() || '';
		const slug = formData.get('slug')?.toString().trim() || '';
		const description = formData.get('description')?.toString().trim() || '';
		const thumbnail_url = formData.get('thumbnail_url')?.toString().trim() || null;
		const orderIndex = parseIntField(formData.get('order_index'), { min: 0, fallback: 1 });
		const is_published = formData.get('is_published') === 'on';
		const is_bonus = formData.get('is_bonus') === 'on';

		const errors: Record<string, string> = {};

		if (!title) errors.title = 'Title is required';
		if (!slug) errors.slug = 'Slug is required';
		if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = 'Slug must be lowercase letters, numbers, and hyphens only';
		if (thumbnail_url && !isHttpsUrl(thumbnail_url)) errors.thumbnail_url = 'Must be an https:// URL';
		if (!orderIndex.ok) errors.order_index = orderIndex.error;

		if (Object.keys(errors).length > 0 || !orderIndex.ok) {
			return fail(400, { errors });
		}

		const order_index = orderIndex.value ?? 1;

		// Check for duplicate slug
		let existing;
		try {
			[existing] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, slug)).limit(1);
		} catch (err) {
			console.error('Failed to check module slug:', err);
		}

		if (existing) {
			return fail(400, { errors: { slug: 'This slug is already in use' } as Record<string, string> });
		}

		// Create module
		let moduleId: string;
		try {
			const [created] = await db
				.insert(modules)
				.values({
					title,
					slug,
					description: description || null,
					thumbnail_url,
					order_index,
					is_published,
					is_bonus
				})
				.returning({ id: modules.id });
			moduleId = created.id;
		} catch (err) {
			console.error('Failed to create module:', err);
			return fail(500, { error: 'Failed to create module' });
		}

		throw redirect(303, `/admin/modules/${moduleId}`);
	}
};
