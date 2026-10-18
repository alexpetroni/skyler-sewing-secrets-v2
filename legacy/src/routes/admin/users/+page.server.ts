import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { profiles, sessions } from '$lib/server/db/schema';
import { getAuth } from '$lib/server/auth';
import { isUuid } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	try {
		const users = await db.select().from(profiles).orderBy(desc(profiles.created_at));

		return {
			users
		};
	} catch (err) {
		console.error('Failed to load users:', err);
		return {
			users: []
		};
	}
};

export const actions: Actions = {
	toggleSuspend: async ({ request }) => {
		const formData = await request.formData();
		const userId = formData.get('userId')?.toString() ?? '';
		const suspend = formData.get('suspend')?.toString() === 'true';

		if (!isUuid(userId)) {
			return fail(400, { error: 'Invalid user ID' });
		}

		// Optional reason, trimmed and capped at 500 characters; only stored on suspend
		const rawReason = formData.get('reason')?.toString().trim() ?? '';
		const reason = rawReason.length > 0 && rawReason.length <= 500 ? rawReason : null;

		try {
			// Admins cannot be suspended. Because the caller is an admin, this
			// also stops an admin suspending themselves.
			const [target] = await db
				.select({ is_admin: profiles.is_admin })
				.from(profiles)
				.where(eq(profiles.id, userId))
				.limit(1);

			if (!target) {
				return fail(404, { error: 'User not found' });
			}

			if (target.is_admin) {
				return fail(400, { error: 'Admin accounts cannot be suspended' });
			}

			if (suspend) {
				await db
					.update(profiles)
					.set({
						is_suspended: true,
						suspended_at: new Date().toISOString(),
						suspended_reason: reason
					})
					.where(eq(profiles.id, userId));

				// Revoke every Better Auth session so the user is signed out on
				// their next request (no cookie cache is configured)
				await db.delete(sessions).where(eq(sessions.userId, userId));
			} else {
				await db
					.update(profiles)
					.set({ is_suspended: false, suspended_at: null, suspended_reason: null })
					.where(eq(profiles.id, userId));
			}
		} catch (err) {
			console.error('Failed to update user suspension status:', err);
			return fail(500, { error: 'Failed to update user' });
		}

		return { success: true };
	},

	resetPassword: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString();

		if (!email) {
			return fail(400, { error: 'Email is required' });
		}

		try {
			// Better Auth generates the token and sends the reset email itself
			// (via the configured Resend template in sendResetPassword)
			await getAuth().api.requestPasswordReset({
				body: { email, redirectTo: '/auth/reset-password' }
			});
		} catch (err) {
			console.error('Failed to send password reset email:', err);
			return fail(500, { error: 'Failed to send password reset email' });
		}

		return { success: true };
	}
};
