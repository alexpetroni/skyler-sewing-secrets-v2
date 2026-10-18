import { building } from '$app/env';
import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { sequence, type Handle, type HandleServerError } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import {
	NO_ACCESS,
	requireAdmin,
	resolveAccess,
	type Profile
} from '#lib/server/modules/auth/index.ts';
import { createLogger, type Logger } from '#lib/server/platform/logger.ts';
import type { Services } from '#lib/server/runtime/container.ts';
import { withSecurityHeaders } from './security-headers.ts';

export interface CreateHandleOptions {
	getServices: () => Promise<Services>;
	isMaintenanceExempt: (pathname: string) => boolean;
}

const MAINTENANCE_MESSAGE = 'The site is under maintenance. Please try again shortly.';

function isReadMethod(request: Request): boolean {
	return request.method === 'GET' || request.method === 'HEAD';
}

function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** Where an admin turns two-factor authentication on. */
export const TWO_FACTOR_SETUP_PATH = '/admin/security';
export const TWO_FACTOR_REQUIRED_MESSAGE =
	'Two-factor authentication is required for admin accounts.';

function isTwoFactorSetupPath(pathname: string): boolean {
	return pathname === TWO_FACTOR_SETUP_PATH || pathname.startsWith(`${TWO_FACTOR_SETUP_PATH}/`);
}

function withMaintenanceHeaders(response: Response): Response {
	response.headers.set('Retry-After', '300');
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

/**
 * The request pipeline. Every response, including the redirects and errors the
 * gates throw, leaves through `withSecurityHeaders`.
 */
export function createHandle(options: CreateHandleOptions): Handle {
	const { getServices, isMaintenanceExempt } = options;

	// (e) Headers on every response. A redirect()/error() thrown by a gate would
	// be turned into a response by SvelteKit without passing through here, so
	// the throws are built into responses in this outermost handler.
	const securityHeaders: Handle = async ({ event, resolve }) => {
		try {
			return withSecurityHeaders(await resolve(event), event.url);
		} catch (e) {
			if (isRedirect(e)) {
				return withSecurityHeaders(
					new Response(null, { status: e.status, headers: { location: e.location } }),
					event.url
				);
			}
			if (isHttpError(e)) {
				const response = Response.json({ message: e.body.message }, { status: e.status });
				if (e.status === 503) withMaintenanceHeaders(response);
				return withSecurityHeaders(response, event.url);
			}
			throw e;
		}
	};

	// (b) Session + profile + all-access flag → locals; a missing profile is self-healed.
	const resolveSession: Handle = async ({ event, resolve }) => {
		const { auth, users, entitlements, logger } = event.locals.services;
		const sessionData = await auth.api.getSession({ headers: event.request.headers });
		event.locals.user = sessionData?.user ?? null;

		let profile: Profile | null = null;
		if (sessionData?.user) {
			const { id, email, name } = sessionData.user;
			profile = await users.getProfile(id);
			if (!profile) {
				try {
					await users.ensureProfile({ userId: id, email, fullName: name });
					profile = await users.getProfile(id);
				} catch (err) {
					logger.error('failed to self-heal missing profile', {
						userId: id,
						requestId: event.locals.requestId,
						error: describeError(err)
					});
				}
			}
		}

		const allAccess = sessionData?.user
			? await entitlements.hasAllAccess(sessionData.user.id)
			: false;
		event.locals.profile = profile;
		event.locals.access = resolveAccess(profile, allAccess);
		return resolve(event);
	};

	// (c) Site-wide maintenance mode. While the flag is on, only active admins
	// (a suspended admin is not an admin) and the exempt paths see the normal
	// site; everyone else gets the maintenance page with a 503 at `/`, is
	// redirected to `/` from every other page, and gets a 503 for writes. The
	// `&&` short-circuits, so site_settings is never read for exempt paths or
	// active admins. The flag is cached (and fails open) in the settings service.
	const maintenanceGate: Handle = async ({ event, resolve }) => {
		event.locals.maintenanceMode =
			!isMaintenanceExempt(event.url.pathname) &&
			!event.locals.access.isAdmin &&
			(await event.locals.services.marketing.settings.isMaintenanceMode());

		if (event.locals.maintenanceMode && event.url.pathname !== '/') {
			if (isReadMethod(event.request)) redirect(303, '/');
			error(503, MAINTENANCE_MESSAGE);
		}

		const response = await resolve(event);

		// The homepage load renders the maintenance page; serve it as 503 so
		// search engines keep the index ("temporarily away") instead of dropping
		// pages. Data requests (__data.json) keep their status so client-side
		// navigation to `/` still works.
		if (event.locals.maintenanceMode && !event.isDataRequest) {
			return withMaintenanceHeaders(
				new Response(response.body, { status: 503, headers: response.headers })
			);
		}
		return response;
	};

	// (d) Admin gate. SvelteKit runs form actions before layout loads, so the
	// layout guard alone does not protect POSTs: every /admin request is gated here.
	// An admin without two-factor authentication may only reach the page that
	// sets it up (and /auth/*, which is not under /admin): reads are sent
	// there, writes get a 403.
	const adminGate: Handle = ({ event, resolve }) => {
		if (isAdminPath(event.url.pathname)) {
			const { user } = requireAdmin(event);
			if (user.twoFactorEnabled !== true && !isTwoFactorSetupPath(event.url.pathname)) {
				if (isReadMethod(event.request)) redirect(303, `${TWO_FACTOR_SETUP_PATH}?required=1`);
				error(403, TWO_FACTOR_REQUIRED_MESSAGE);
			}
		}
		return resolve(event);
	};

	const gated = sequence(resolveSession, maintenanceGate, adminGate);

	// (a) Services on locals; Better Auth endpoints bypass the session lookup.
	const dispatch: Handle = async ({ event, resolve }) => {
		event.locals.user = null;
		event.locals.profile = null;
		event.locals.access = NO_ACCESS;
		event.locals.maintenanceMode = false;
		event.locals.requestId = crypto.randomUUID();

		// No page needs auth or the database at prerender time, and the
		// services need runtime env vars: skip them entirely during the build.
		if (building) return resolve(event);

		event.locals.services = await getServices();

		// Better Auth endpoints never read locals: hand the request straight to
		// its handler without the session and profile round trips.
		if (event.url.pathname.startsWith('/api/auth/')) {
			return svelteKitHandler({ event, resolve, auth: event.locals.services.auth, building });
		}

		return gated({ event, resolve });
	};

	return sequence(securityHeaders, dispatch);
}

const GENERIC_5XX_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Unexpected errors are logged under an id and the client gets a generic
 * message; expected ones (`error()`, 404s) keep their message and gain the id.
 * Never throws: if the services cannot be built, logging falls back to a
 * standalone JSON logger.
 */
export function createHandleError(options: {
	getServices: () => Promise<Pick<Services, 'logger'>>;
}): HandleServerError {
	return async (input) => {
		const { kind, event } = input;
		const errorId = crypto.randomUUID();
		const logger: Logger = await options
			.getServices()
			.then((services) => services.logger)
			.catch(() => createLogger({ level: 'info' }));

		const fields = {
			errorId,
			kind,
			method: event.request.method,
			pathname: event.url.pathname,
			requestId: event.locals.requestId
		};
		if (kind === 'unknown') {
			logger.error('unhandled request error', { ...fields, error: describeError(input.error) });
			return { message: GENERIC_5XX_MESSAGE, errorId };
		}
		logger.warn('request error', {
			...fields,
			status: 'status' in input.error ? input.error.status : undefined
		});
		return { errorId };
	};
}

function describeError(err: unknown): { message: string; stack?: string } {
	if (err instanceof Error) return { message: err.message, stack: err.stack };
	return { message: String(err) };
}
