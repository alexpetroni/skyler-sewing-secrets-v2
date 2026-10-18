import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { testimonials } from '$lib/server/db/schema';
import { isUuid, parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	// A non-UUID id is a mistyped URL, not a Postgres error
	if (!isUuid(params.id)) {
		throw error(404, 'Testimonial not found');
	}

	let testimonial;
	try {
		[testimonial] = await db.select().from(testimonials).where(eq(testimonials.id, params.id)).limit(1);
	} catch (err) {
		console.error('Failed to load testimonial:', err);
	}

	if (!testimonial) {
		throw error(404, 'Testimonial not found');
	}

	return {
		testimonial
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'Testimonial not found');
		}

		const formData = await request.formData();

		const author_name = formData.get('author_name')?.toString().trim() || '';
		const author_title = formData.get('author_title')?.toString().trim() || null;
		const country = formData.get('country')?.toString().trim() || null;
		const author_avatar_url = formData.get('author_avatar_url')?.toString().trim() || null;
		const content = formData.get('content')?.toString().trim() || '';
		// The DB has a 1–5 check constraint on rating; reject it here with a field message
		const ratingField = parseIntField(formData.get('rating'), { required: true, min: 1, max: 5 });
		const orderIndex = parseIntField(formData.get('order_index'), { min: 0, fallback: 1 });
		const is_published = formData.get('is_published') === 'on';
		const is_featured = formData.get('is_featured') === 'on';

		const errors: Record<string, string> = {};

		if (!author_name) errors.author_name = 'Author name is required';
		if (!content) errors.content = 'Content is required';
		if (!ratingField.ok) errors.rating = ratingField.error;
		if (!orderIndex.ok) errors.order_index = orderIndex.error;

		if (Object.keys(errors).length > 0 || !ratingField.ok || !orderIndex.ok) {
			return fail(400, { errors });
		}

		const rating = ratingField.value ?? 5;
		const order_index = orderIndex.value ?? 1;

		try {
			await db
				.update(testimonials)
				.set({
					author_name,
					author_title,
					country,
					author_avatar_url,
					content,
					rating,
					order_index,
					is_published,
					is_featured,
					updated_at: new Date().toISOString()
				})
				.where(eq(testimonials.id, params.id));
		} catch (err) {
			console.error('Failed to update testimonial:', err);
			return fail(500, { error: 'Failed to update testimonial' });
		}

		return { success: true };
	},

	delete: async ({ params }) => {
		if (!isUuid(params.id)) {
			throw error(404, 'Testimonial not found');
		}

		try {
			await db.delete(testimonials).where(eq(testimonials.id, params.id));
		} catch (err) {
			console.error('Failed to delete testimonial:', err);
			return fail(500, { error: 'Failed to delete testimonial' });
		}

		throw redirect(303, '/admin/testimonials');
	}
};
