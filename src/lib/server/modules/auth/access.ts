import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Viewer } from '#lib/shared/viewer.ts';
import type { AuthUser } from './create-auth.ts';
import type { Profile } from './service.ts';

/**
 * Shared access predicates. There is no Row Level Security, so every server
 * load, action and endpoint decides access through these helpers, even when
 * the hook already gated the route.
 *
 * Invariant: a suspended account is neither a member nor an admin, whatever
 * its `is_member` / `is_admin` flags say. Member and entitlement predicates
 * arrive with the entitlements module (PHASE-08).
 */

/** Message shown to suspended members wherever access is refused. */
export const SUSPENDED_MESSAGE =
	'Your account has been suspended. Please contact us if you think this is a mistake.';

type ProfileFlags = Pick<Profile, 'is_admin' | 'is_suspended'>;

/** What the hook resolved for the request; `allAccess` is filled by PHASE-08. */
export interface Access {
	isAdmin: boolean;
	isSuspended: boolean;
	allAccess: boolean;
}

export const NO_ACCESS: Access = { isAdmin: false, isSuspended: false, allAccess: false };

export function isSuspended(profile: ProfileFlags | null | undefined): boolean {
	return !!profile?.is_suspended;
}

/** An admin who is not suspended: a suspended admin is not an admin. */
export function isActiveAdmin(profile: ProfileFlags | null | undefined): boolean {
	return !!profile?.is_admin && !profile.is_suspended;
}

export function resolveAccess(profile: ProfileFlags | null | undefined): Access {
	return {
		isAdmin: isActiveAdmin(profile),
		isSuspended: isSuspended(profile),
		// Computed from entitlements in PHASE-08; until then nobody has it.
		allAccess: false
	};
}

export interface SignedIn {
	user: AuthUser;
	profile: Profile;
}

function signInRedirect(redirectTo: string): never {
	redirect(303, `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`);
}

/**
 * For page loads: signed-out visitors go to sign-in and return to
 * `redirectTo` (default: the current path) afterwards; suspended accounts get
 * a 403.
 */
export function requireUser(event: RequestEvent, redirectTo?: string): SignedIn {
	const { user, profile } = event.locals;
	if (!user || !profile) {
		signInRedirect(redirectTo ?? `${event.url.pathname}${event.url.search}`);
	}
	if (isSuspended(profile)) {
		error(403, SUSPENDED_MESSAGE);
	}
	return { user, profile };
}

/**
 * The admin gate, as legacy: reads redirect (to sign-in when signed out, to
 * `/` otherwise), writes get 401 / 403. Form actions run before layout loads,
 * so this guards POSTs too.
 */
export function requireAdmin(event: RequestEvent): SignedIn {
	const { user, profile } = event.locals;
	const isReadMethod = event.request.method === 'GET' || event.request.method === 'HEAD';

	if (!user) {
		if (isReadMethod) signInRedirect(event.url.pathname);
		error(401, 'Unauthorized');
	}
	if (!profile || !isActiveAdmin(profile)) {
		if (isReadMethod) redirect(303, '/');
		error(403, 'Forbidden');
	}
	return { user, profile };
}

/** What the page shell may know about the visitor; nothing else leaves the server. */
export function toViewer(profile: Profile | null | undefined): Viewer | null {
	if (!profile) return null;
	return {
		name: profile.full_name,
		avatarUrl: profile.avatar_url,
		isAdmin: isActiveAdmin(profile)
	};
}
