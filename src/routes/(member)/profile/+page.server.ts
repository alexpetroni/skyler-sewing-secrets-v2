import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { readForm } from '#lib/server/http/forms.ts';
import { requireUser } from '#lib/server/modules/auth/index.ts';
import { profileNameSchema } from '#lib/shared/schemas/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user, profile } = requireUser(event, '/profile');
	const { entitlements, marketing, users } = event.locals.services;
	const [owned, testimonial, hasPassword] = await Promise.all([
		entitlements.listForUser(user.id),
		marketing.testimonials.forUser(user.id),
		users.hasPassword(user.id)
	]);
	return {
		profile: {
			email: profile.email,
			fullName: profile.full_name,
			avatarUrl: profile.avatar_url,
			createdAt: profile.created_at
		},
		allAccess: event.locals.access.allAccess,
		isAdmin: event.locals.access.isAdmin,
		/** False after a checkout claim (and for Google-only accounts): the page offers to set one. */
		hasPassword,
		owned: owned.map((entitlement) => ({
			id: entitlement.id,
			title: entitlement.product.title,
			slug: entitlement.product.slug,
			kind: entitlement.product.kind,
			grantedAt: entitlement.granted_at
		})),
		testimonial
	};
};

export const actions: Actions = {
	updateProfile: async (event) => {
		const { user } = requireUser(event, '/profile');
		const form = await readForm(event.request);
		const fullName = form.full_name ?? '';
		const parsed = v.safeParse(profileNameSchema, form);
		if (!parsed.success) return fail(400, { error: parsed.issues[0].message, fullName });

		await event.locals.services.users.updateProfile(user.id, {
			fullName: parsed.output.full_name
		});
		return { success: true };
	},

	signOutEverywhere: async (event) => {
		const { user } = requireUser(event, '/profile');
		// Deletes every session row, this browser's included.
		await event.locals.services.users.revokeAllSessions(user.id);
		redirect(303, '/auth/sign-in');
	}
};
