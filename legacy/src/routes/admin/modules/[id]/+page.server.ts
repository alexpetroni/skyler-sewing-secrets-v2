import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { modules, lessons } from '$lib/server/db/schema';
import { isHttpsUrl, isUuid, parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	// A non-UUID id is a mistyped URL, not a Postgres error
	if (!isUuid(params.id)) {
		throw error(404, 'Module not found');
	}

	let moduleData;
	try {
		moduleData = await db.query.modules.findFirst({
			where: eq(modules.id, params.id),
			with: {
				lessons: {
					columns: {
						id: true,
						title: true,
						slug: true,
						order_index: true,
						is_published: true,
						is_free_preview: true
					}
				}
			}
		});
	} catch (err) {
		console.error('Failed to load module:', err);
	}

	if (!moduleData) {
		throw error(404, 'Module not found');
	}

	// Sort lessons by order
	if (moduleData.lessons) {
		moduleData.lessons.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index);
	}

	return {
		module: moduleData
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'Module not found');
		}

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

		// Check for duplicate slug (excluding current module)
		let existing;
		try {
			[existing] = await db
				.select({ id: modules.id })
				.from(modules)
				.where(and(eq(modules.slug, slug), ne(modules.id, params.id)))
				.limit(1);
		} catch (err) {
			console.error('Failed to check module slug:', err);
		}

		if (existing) {
			return fail(400, { errors: { slug: 'This slug is already in use' } as Record<string, string> });
		}

		// Update module
		try {
			await db
				.update(modules)
				.set({
					title,
					slug,
					description: description || null,
					thumbnail_url,
					order_index,
					is_published,
					is_bonus,
					updated_at: new Date().toISOString()
				})
				.where(eq(modules.id, params.id));
		} catch (err) {
			console.error('Failed to update module:', err);
			return fail(500, { error: 'Failed to update module' });
		}

		return { success: true };
	},

	delete: async ({ params }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'Module not found');
		}

		// Delete all lessons in this module first
		try {
			await db.delete(lessons).where(eq(lessons.module_id, params.id));
		} catch (err) {
			console.error('Failed to delete module lessons:', err);
		}

		// Delete the module
		try {
			await db.delete(modules).where(eq(modules.id, params.id));
		} catch (err) {
			console.error('Failed to delete module:', err);
			return fail(500, { error: 'Failed to delete module' });
		}

		throw redirect(303, '/admin/modules');
	}
};
