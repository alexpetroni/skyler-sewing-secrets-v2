import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq, and, ne, asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { modules, lessons, lesson_resources, user_progress } from '$lib/server/db/schema';
import { isBunnyVideoRef, isHttpsUrl, isUuid, parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	// A non-UUID id is a mistyped URL, not a Postgres error
	if (!isUuid(params.id)) {
		throw error(404, 'Lesson not found');
	}

	let lesson;
	let moduleRows: { id: string; title: string }[] = [];
	try {
		const [lessonRows, modRows] = await Promise.all([
			db.select().from(lessons).where(eq(lessons.id, params.id)).limit(1),
			db.select({ id: modules.id, title: modules.title }).from(modules).orderBy(asc(modules.order_index))
		]);
		lesson = lessonRows[0];
		moduleRows = modRows;
	} catch (err) {
		console.error('Failed to load lesson:', err);
	}

	if (!lesson) {
		throw error(404, 'Lesson not found');
	}

	return {
		lesson,
		modules: moduleRows
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'Lesson not found');
		}

		const formData = await request.formData();

		const module_id = formData.get('module_id')?.toString() || '';
		const title = formData.get('title')?.toString().trim() || '';
		const slug = formData.get('slug')?.toString().trim() || '';
		const description = formData.get('description')?.toString().trim() || '';
		const video_url = formData.get('video_url')?.toString().trim() || null;
		const thumbnail_url = formData.get('thumbnail_url')?.toString().trim() || null;
		const durationMinutes = parseIntField(formData.get('duration_minutes'), { min: 1, max: 600 });
		const orderIndex = parseIntField(formData.get('order_index'), { min: 0, fallback: 1 });
		const content = formData.get('content')?.toString().trim() || null;
		const is_published = formData.get('is_published') === 'on';
		const is_free_preview = formData.get('is_free_preview') === 'on';

		const errors: Record<string, string> = {};

		if (!module_id) errors.module_id = 'Module is required';
		else if (!isUuid(module_id)) errors.module_id = 'Invalid module';
		if (!title) errors.title = 'Title is required';
		if (!slug) errors.slug = 'Slug is required';
		if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = 'Slug must be lowercase letters, numbers, and hyphens only';
		// Only bunny:<library>/<video> references render; anything else shows "Video unavailable"
		if (video_url && !isBunnyVideoRef(video_url)) {
			errors.video_url = 'Use the format bunny:<library>/<video> (other URLs cannot be played)';
		}
		if (thumbnail_url && !isHttpsUrl(thumbnail_url)) errors.thumbnail_url = 'Must be an https:// URL';
		if (!durationMinutes.ok) errors.duration_minutes = durationMinutes.error;
		if (!orderIndex.ok) errors.order_index = orderIndex.error;

		if (Object.keys(errors).length > 0 || !durationMinutes.ok || !orderIndex.ok) {
			return fail(400, { errors });
		}

		const duration_minutes = durationMinutes.value;
		const order_index = orderIndex.value ?? 1;

		// Check for duplicate slug within the same module (excluding current lesson)
		let existing;
		try {
			[existing] = await db
				.select({ id: lessons.id })
				.from(lessons)
				.where(and(eq(lessons.module_id, module_id), eq(lessons.slug, slug), ne(lessons.id, params.id)))
				.limit(1);
		} catch (err) {
			console.error('Failed to check lesson slug:', err);
		}

		if (existing) {
			return fail(400, { errors: { slug: 'This slug is already in use in this module' } as Record<string, string> });
		}

		// Update lesson
		try {
			await db
				.update(lessons)
				.set({
					module_id,
					title,
					slug,
					description: description || null,
					video_url,
					thumbnail_url,
					duration_minutes,
					order_index,
					content,
					is_published,
					is_free_preview,
					updated_at: new Date().toISOString()
				})
				.where(eq(lessons.id, params.id));
		} catch (err) {
			console.error('Failed to update lesson:', err);
			return fail(500, { error: 'Failed to update lesson' });
		}

		return { success: true };
	},

	delete: async ({ params }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'Lesson not found');
		}

		// Delete lesson resources first
		try {
			await db.delete(lesson_resources).where(eq(lesson_resources.lesson_id, params.id));
		} catch (err) {
			console.error('Failed to delete lesson resources:', err);
		}

		// Delete user progress for this lesson
		try {
			await db.delete(user_progress).where(eq(user_progress.lesson_id, params.id));
		} catch (err) {
			console.error('Failed to delete lesson progress:', err);
		}

		// Delete the lesson
		try {
			await db.delete(lessons).where(eq(lessons.id, params.id));
		} catch (err) {
			console.error('Failed to delete lesson:', err);
			return fail(500, { error: 'Failed to delete lesson' });
		}

		throw redirect(303, '/admin/lessons');
	}
};
