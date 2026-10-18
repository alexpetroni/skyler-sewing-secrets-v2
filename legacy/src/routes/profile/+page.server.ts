import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { profiles, testimonials } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;

	if (!profile) {
		throw redirect(303, '/auth/sign-in?redirectTo=/profile');
	}

	// Get user's testimonial if any
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
	updateProfile: async ({ request, locals }) => {
		const profile = locals.profile;

		if (!profile) {
			throw redirect(303, '/auth/sign-in');
		}

		const formData = await request.formData();
		const fullName = formData.get('full_name') as string;
		const trimmedName = fullName?.trim() ?? '';

		if (!trimmedName || trimmedName.length < 2) {
			return fail(400, {
				error: 'Name must be at least 2 characters',
				fullName
			});
		}

		if (trimmedName.length > 100) {
			return fail(400, {
				error: 'Name must be 100 characters or fewer',
				fullName
			});
		}

		try {
			await db
				.update(profiles)
				.set({ full_name: trimmedName })
				.where(eq(profiles.id, profile.id));
		} catch (error) {
			console.error('Error updating profile:', error);
			return fail(500, {
				error: 'Failed to update profile. Please try again.',
				fullName
			});
		}

		return { success: true };
	}
};
