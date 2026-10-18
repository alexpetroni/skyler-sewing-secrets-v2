import {
	error,
	isHttpError,
	isRedirect,
	json,
	redirect,
	type Handle,
	type HandleServerError,
	type RequestEvent
} from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { eq } from 'drizzle-orm';
import { getAuth } from '$lib/server/auth';
import { isActiveAdmin } from '$lib/server/access';
import { db } from '$lib/server/db';
import { isMaintenanceExempt, isMaintenanceMode } from '$lib/server/maintenance';
import { profiles } from '$lib/server/db/schema';
import { ensureProfile } from '$lib/server/users';

// Baseline security headers on every response. Headers are only set when
// absent so a route can still override one deliberately. No
// CSP yet (it needs allow-lists for fonts, the Bunny
// iframe and the CDN), and Permissions-Policy leaves autoplay, fullscreen
// and picture-in-picture alone because the lesson player's iframe uses them.
function withSecurityHeaders(response: Response, url: URL): Response {
	const headers = response.headers;
	const setIfAbsent = (name: string, value: string) => {
		if (!headers.has(name)) headers.set(name, value);
	};

	setIfAbsent('X-Content-Type-Options', 'nosniff');
	setIfAbsent('Referrer-Policy', 'strict-origin-when-cross-origin');
	setIfAbsent('X-Frame-Options', 'DENY');
	setIfAbsent('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

	// HSTS is only meaningful (and only safe) over https
	if (url.protocol === 'https:') {
		setIfAbsent('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
}

/**
 * The /admin gate and the maintenance gate. Both leave through redirect() /
 * error(), which `handle` catches and turns into responses that carry the
 * security headers. Sets `event.locals.maintenanceMode`.
 */
async function applyGates(event: RequestEvent): Promise<void> {
	// SvelteKit runs form actions before layout loads, so the layout guard
	// alone does not protect POSTs — gate every /admin request here too.
	// A suspended admin is not an admin.
	if (event.url.pathname === '/admin' || event.url.pathname.startsWith('/admin/')) {
		const isReadMethod = event.request.method === 'GET' || event.request.method === 'HEAD';

		if (!event.locals.user) {
			if (isReadMethod) {
				redirect(303, `/auth/sign-in?redirectTo=${encodeURIComponent(event.url.pathname)}`);
			}
			error(401, 'Unauthorized');
		}

		if (!isActiveAdmin(event.locals.profile)) {
			if (isReadMethod) {
				redirect(303, '/');
			}
			error(403, 'Forbidden');
		}
	}

	// Site-wide maintenance mode. Invariant: while the flag is on, only active
	// admins (a suspended admin is not an admin) and the exempt paths see the
	// normal site; everyone else gets the maintenance page with a 503 at `/`,
	// is redirected to `/` from every other page, and gets a 503 for writes.
	// The `&&` short-circuits, so site_settings is never queried for exempt
	// paths or active admins.
	event.locals.maintenanceMode =
		!isMaintenanceExempt(event.url.pathname) &&
		!isActiveAdmin(event.locals.profile) &&
		(await isMaintenanceMode());

	if (event.locals.maintenanceMode && event.url.pathname !== '/') {
		if (event.request.method === 'GET' || event.request.method === 'HEAD') {
			redirect(303, '/');
		}
		error(503, 'The site is under maintenance. Please try again shortly.');
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	// No page needs auth or the database at prerender time, and the auth
	// instance requires runtime env vars — skip it entirely during build.
	if (building) {
		event.locals.session = null;
		event.locals.user = null;
		event.locals.profile = null;
		event.locals.maintenanceMode = false;
		return resolve(event);
	}

	const auth = getAuth();

	// Better Auth endpoints never read locals — skip the extra session and
	// profile roundtrips and hand the request straight to the handler
	if (event.url.pathname.startsWith('/api/auth/')) {
		event.locals.session = null;
		event.locals.user = null;
		event.locals.profile = null;
		event.locals.maintenanceMode = false;
		return withSecurityHeaders(
			await svelteKitHandler({ event, resolve, auth, building }),
			event.url
		);
	}

	const sessionData = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = sessionData?.session ?? null;
	event.locals.user = sessionData?.user ?? null;

	if (sessionData?.user) {
		let [profile] = await db
			.select()
			.from(profiles)
			.where(eq(profiles.id, sessionData.user.id))
			.limit(1);

		if (!profile) {
			try {
				await ensureProfile({
					userId: sessionData.user.id,
					email: sessionData.user.email,
					fullName: sessionData.user.name
				});
				[profile] = await db
					.select()
					.from(profiles)
					.where(eq(profiles.id, sessionData.user.id))
					.limit(1);
			} catch (err) {
				console.error('[hooks] failed to self-heal missing profile', err);
			}
		}

		event.locals.profile = profile ?? null;
	} else {
		event.locals.profile = null;
	}

	// Invariant: every response leaving the hook passes through
	// withSecurityHeaders. A redirect()/error() thrown by the gates would be
	// turned into a response by SvelteKit without going through it, so the
	// gates run inside a try and their throws are built into responses here.
	try {
		await applyGates(event);
	} catch (e) {
		if (isRedirect(e)) {
			return withSecurityHeaders(
				new Response(null, { status: e.status, headers: { location: e.location } }),
				event.url
			);
		}
		if (isHttpError(e)) {
			const response = json({ message: e.body.message }, { status: e.status });
			if (e.status === 503) {
				response.headers.set('Retry-After', '300');
				response.headers.set('Cache-Control', 'no-store');
			}
			return withSecurityHeaders(response, event.url);
		}
		throw e;
	}

	// Serves all /api/auth/* endpoints (sign-in, Google OAuth callback, etc.)
	const response = await svelteKitHandler({ event, resolve, auth, building });

	// The homepage load renders the maintenance page; serve it as 503 so search
	// engines keep the index ("temporarily away") instead of dropping pages.
	// Data requests (__data.json) keep their status so client-side navigation
	// to `/` still works.
	if (event.locals.maintenanceMode && !event.isDataRequest) {
		const maintenanceResponse = new Response(response.body, {
			status: 503,
			headers: response.headers
		});
		maintenanceResponse.headers.set('Retry-After', '300');
		maintenanceResponse.headers.set('Cache-Control', 'no-store');
		return withSecurityHeaders(maintenanceResponse, event.url);
	}

	return withSecurityHeaders(response, event.url);
};

/**
 * Unexpected errors: log the full error server-side under an id and hand the
 * client a generic message for 5xx. The raw error message never reaches the
 * response.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const errorId = crypto.randomUUID();
	console.error(`[error] ${status} ${event.request.method} ${event.url.pathname} id=${errorId}`, error);
	return {
		message: status >= 500 ? 'Something went wrong. Please try again.' : message,
		errorId
	};
};
