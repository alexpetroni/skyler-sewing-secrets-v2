import { error, redirect } from '@sveltejs/kit';
import type { User } from '$lib/types';

/**
 * Shared access predicates. Row Level Security is gone, so every server load,
 * action and API handler decides member/admin access through these helpers.
 *
 * Invariant: a suspended account is neither a member nor an admin, whatever
 * its `is_member` / `is_admin` flags say.
 */

/** Message shown to suspended members wherever access is refused. */
export const SUSPENDED_MESSAGE =
	'Your account has been suspended. Please contact us if you think this is a mistake.';

/** A member who is not suspended. */
export function isActiveMember(profile: User | null | undefined): boolean {
	return !!profile?.is_member && !profile.is_suspended;
}

/** An admin who is not suspended: a suspended admin is not an admin. */
export function isActiveAdmin(profile: User | null | undefined): boolean {
	return !!profile?.is_admin && !profile.is_suspended;
}

/**
 * For page loads: signed-out visitors go to sign-in, non-members to checkout
 * (both returning to `redirectTo` afterwards), and suspended members get a 403.
 */
export function requireActiveMember(
	profile: User | null | undefined,
	redirectTo: string
): asserts profile is User {
	if (!profile) {
		redirect(303, `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	if (!profile.is_member) {
		redirect(303, `/checkout?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	if (profile.is_suspended) {
		error(403, SUSPENDED_MESSAGE);
	}
}
