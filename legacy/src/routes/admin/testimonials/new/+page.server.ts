import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { testimonials } from '$lib/server/db/schema';
import { parseIntField } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	let lastTestimonial;
	try {
		[lastTestimonial] = await db
			.select({ order_index: testimonials.order_index })
			.from(testimonials)
			.orderBy(desc(testimonials.order_index))
			.limit(1);
	} catch (err) {
		console.error('Failed to load next testimonial order index:', err);
	}

	const nextOrderIndex = (lastTestimonial?.order_index || 0) + 1;

	return {
		nextOrderIndex
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
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

		let testimonialId: string;
		try {
			const [created] = await db
				.insert(testimonials)
				.values({
					author_name,
					author_title,
					country,
					author_avatar_url,
					content,
					rating,
					order_index,
					is_published,
					is_featured
				})
				.returning({ id: testimonials.id });
			testimonialId = created.id;
		} catch (err) {
			console.error('Failed to create testimonial:', err);
			return fail(500, { error: 'Failed to create testimonial' });
		}

		throw redirect(303, `/admin/testimonials/${testimonialId}`);
	}
};
