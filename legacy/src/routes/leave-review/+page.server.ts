import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { testimonials } from '$lib/server/db/schema';
import { isActiveMember, requireActiveMember, SUSPENDED_MESSAGE } from '$lib/server/access';

export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;

	// Sign-in / checkout redirects, 403 for suspended members
	requireActiveMember(profile, '/leave-review');

	// Get user's existing testimonial if any
	const [testimonial] = await db
		.select()
		.from(testimonials)
		.where(eq(testimonials.user_id, profile.id))
		.limit(1);

	return {
		profile,
		testimonial: testimonial ?? null
	};
};

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		const profile = locals.profile;

		if (!profile) {
			throw redirect(303, '/auth/sign-in');
		}

		// Actions return rather than redirect; a suspended member is not an active member
		if (!isActiveMember(profile)) {
			return fail(403, {
				error: profile.is_member ? SUSPENDED_MESSAGE : 'Only members can leave reviews.'
			});
		}

		const formData = await request.formData();
		const content = formData.get('content') as string;
		const rating = parseInt(formData.get('rating') as string, 10);
		const authorTitle = formData.get('author_title') as string;

		// Validation
		if (!content || content.trim().length < 20) {
			return fail(400, {
				error: 'Review must be at least 20 characters long.',
				content,
				rating,
				authorTitle
			});
		}

		if (content.trim().length > 1000) {
			return fail(400, {
				error: 'Review must be less than 1000 characters.',
				content,
				rating,
				authorTitle
			});
		}

		if (!rating || rating < 1 || rating > 5) {
			return fail(400, {
				error: 'Please select a rating between 1 and 5 stars.',
				content,
				rating,
				authorTitle
			});
		}

		// Check for existing testimonial (only own rows are ever touched)
		const [existingTestimonial] = await db
			.select({ id: testimonials.id, is_published: testimonials.is_published })
			.from(testimonials)
			.where(eq(testimonials.user_id, profile.id))
			.limit(1);

		if (existingTestimonial) {
			// Can only update if not published
			if (existingTestimonial.is_published) {
				return fail(400, {
					error: 'Your review has already been published and cannot be edited.',
					content,
					rating,
					authorTitle
				});
			}

			try {
				await db
					.update(testimonials)
					.set({
						content: content.trim(),
						rating,
						author_name: profile.full_name || 'Member',
						author_title: authorTitle?.trim() || null,
						author_avatar_url: profile.avatar_url
					})
					.where(eq(testimonials.id, existingTestimonial.id));
			} catch (error) {
				console.error('Error updating testimonial:', error);
				return fail(500, {
					error: 'Failed to update review. Please try again.',
					content,
					rating,
					authorTitle
				});
			}
		} else {
			try {
				await db.insert(testimonials).values({
					user_id: profile.id,
					content: content.trim(),
					rating,
					author_name: profile.full_name || 'Member',
					author_title: authorTitle?.trim() || null,
					author_avatar_url: profile.avatar_url,
					is_published: false,
					is_featured: false
				});
			} catch (error) {
				console.error('Error creating testimonial:', error);
				return fail(500, {
					error: 'Failed to submit review. Please try again.',
					content,
					rating,
					authorTitle
				});
			}
		}

		throw redirect(303, '/profile?review=submitted');
	}
};
