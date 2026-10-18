import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { newsletter_subscribers } from '$lib/server/db/schema';
import { verifyUnsubscribeToken } from '$lib/server/newsletter';

const INVALID_LINK = 'This unsubscribe link is invalid.';

// GET only verifies the signed link and shows a confirm button. It never
// touches the database: mail clients and link scanners prefetch URLs.
export const load: PageServerLoad = async ({ url }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase() || '';
	const token = url.searchParams.get('token') || '';

	if (!email || !token || !(await verifyUnsubscribeToken(email, token))) {
		error(400, INVALID_LINK);
	}

	return { email, token };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase() || '';
		const token = formData.get('token')?.toString() || '';

		// Re-verify on POST: the form fields are attacker-controlled input.
		if (!email || !token || !(await verifyUnsubscribeToken(email, token))) {
			return fail(400, { error: INVALID_LINK });
		}

		// Idempotent: an unknown or already-inactive address matches zero rows
		// (or rewrites the same values) and still reports success.
		try {
			await db
				.update(newsletter_subscribers)
				.set({ is_active: false, unsubscribed_at: new Date().toISOString() })
				.where(eq(newsletter_subscribers.email, email));
		} catch (err) {
			console.error('[newsletter] Unsubscribe failed:', err);
			return fail(500, { error: 'Something went wrong. Please try again.' });
		}

		return { success: true };
	}
};
