import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { createHandle } from '../../src/lib/server/http/create-handle.ts';
import { isMaintenanceExempt } from '../../src/lib/server/http/maintenance.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent, runHandle, type FakeEvent } from '../helpers/event.ts';
import { createTestServices, signInCookie, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { profiles, site_settings } = schema;

const PASSWORD = 'a-good-password';

interface Call {
	status: number;
	headers: Headers;
	location: string | null;
	body: string;
	resolved: boolean;
	event: FakeEvent;
}

describe('createHandle', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let handle: Handle;
	let memberId: string;
	let memberCookie: string;
	let adminCookie: string;
	let suspendedAdminCookie: string;

	beforeEach(async () => {
		services = createTestServices(db());
		handle = createHandle({ getServices: async () => services, isMaintenanceExempt });

		memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: PASSWORD,
			fullName: 'Member'
		});
		const adminId = await services.users.createCredentialUser({
			email: 'admin@example.com',
			password: PASSWORD,
			fullName: 'Admin'
		});
		const suspendedAdminId = await services.users.createCredentialUser({
			email: 'suspended-admin@example.com',
			password: PASSWORD
		});
		await services.users.setAdmin(adminId, true, adminId);
		// A legacy row can be an admin and suspended at once; the service refuses
		// to create that state, so the test writes it directly.
		await db()
			.update(profiles)
			.set({ is_admin: true, is_suspended: true })
			.where(eq(profiles.id, suspendedAdminId));

		memberCookie = await signInCookie(services, 'member@example.com', PASSWORD);
		adminCookie = await signInCookie(services, 'admin@example.com', PASSWORD);
		suspendedAdminCookie = await signInCookie(services, 'suspended-admin@example.com', PASSWORD);
	});

	/** The flagship product; whoever owns it has all access. */
	async function grantAllAccess(userId: string): Promise<void> {
		const course = await services.catalog.create({
			kind: 'course',
			slug: 'the-course',
			title: 'The Course',
			tagline: '',
			descriptionMd: '',
			coverImageUrl: '',
			price: 14900,
			salePrice: null,
			saleStartsAt: null,
			saleEndsAt: null,
			isFeatured: false,
			sortOrder: 0
		});
		await services.entitlements.grant({ userId, productId: course.id, source: 'migration' });
	}

	async function call(options: {
		method?: string;
		path: string;
		cookie?: string;
		isDataRequest?: boolean;
	}): Promise<Call> {
		const event = fakeEvent({
			method: options.method,
			url: options.path,
			headers: options.cookie ? { cookie: options.cookie } : undefined,
			isDataRequest: options.isDataRequest
		});
		let resolved = false;
		const response = await runHandle(handle, event, async () => {
			resolved = true;
			return new Response('page', { status: 200, headers: { 'content-type': 'text/html' } });
		});
		return {
			status: response.status,
			headers: response.headers,
			location: response.headers.get('location'),
			body: await response.text(),
			resolved,
			event
		};
	}

	function expectSecurityHeaders(result: Call) {
		expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(result.headers.get('X-Frame-Options')).toBe('DENY');
		expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
	}

	describe('Content Security Policy', () => {
		it('keeps the CSP header SvelteKit set on the page response', async () => {
			const policy = "default-src 'self'; script-src 'self' 'nonce-abc123'";
			const event = fakeEvent({ url: '/', headers: { cookie: memberCookie } });
			const response = await runHandle(handle, event, async () => {
				return new Response('page', {
					status: 200,
					headers: { 'content-type': 'text/html', 'content-security-policy': policy }
				});
			});

			expect(response.status).toBe(200);
			expect(response.headers.get('content-security-policy')).toBe(policy);
			// The baseline headers are added without touching the policy.
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		});
	});

	describe('session and locals', () => {
		it('a visitor without a cookie gets empty locals and the page', async () => {
			const result = await call({ path: '/' });

			expect(result.status).toBe(200);
			expect(result.resolved).toBe(true);
			expect(result.event.locals.user).toBeNull();
			expect(result.event.locals.profile).toBeNull();
			expect(result.event.locals.access).toEqual({
				isAdmin: false,
				isSuspended: false,
				allAccess: false
			});
			expect(result.event.locals.services).toBe(services);
			expect(result.event.locals.requestId).toMatch(/^[0-9a-f-]{36}$/);
			expect(result.event.locals.maintenanceMode).toBe(false);
			expectSecurityHeaders(result);
		});

		it('a session cookie resolves the user, profile and access flags', async () => {
			const result = await call({ path: '/library', cookie: adminCookie });

			expect(result.status).toBe(200);
			expect(result.event.locals.user?.email).toBe('admin@example.com');
			expect(result.event.locals.profile?.is_admin).toBe(true);
			expect(result.event.locals.access).toEqual({
				isAdmin: true,
				isSuspended: false,
				allAccess: false
			});
		});

		it('a suspended admin is flagged suspended and not admin', async () => {
			const result = await call({ path: '/library', cookie: suspendedAdminCookie });

			expect(result.event.locals.access).toEqual({
				isAdmin: false,
				isSuspended: true,
				allAccess: false
			});
		});

		it('a user with an active all-access entitlement gets access.allAccess = true', async () => {
			await grantAllAccess(memberId);

			const result = await call({ path: '/library', cookie: memberCookie });
			expect(result.event.locals.access).toEqual({
				isAdmin: false,
				isSuspended: false,
				allAccess: true
			});

			// Suspension overrides ownership: a suspended member has no access.
			await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, memberId));
			const suspended = await call({ path: '/library', cookie: memberCookie });
			expect(suspended.event.locals.access).toEqual({
				isAdmin: false,
				isSuspended: true,
				allAccess: false
			});
		});

		it('self-heals a missing profile from the session user', async () => {
			const userId = result_user_id(await call({ path: '/', cookie: memberCookie }));
			await db().delete(profiles).where(eq(profiles.id, userId));

			const result = await call({ path: '/', cookie: memberCookie });

			expect(result.event.locals.profile).toMatchObject({
				id: userId,
				email: 'member@example.com',
				full_name: 'Member'
			});
		});

		function result_user_id(result: Call): string {
			const id = result.event.locals.user?.id;
			if (!id) throw new Error('expected a signed-in user');
			return id;
		}
	});

	describe('/api/auth passthrough', () => {
		it('skips the session lookup and hands the request to Better Auth', async () => {
			const result = await call({ path: '/api/auth/foo', cookie: adminCookie });

			expect(result.resolved).toBe(false);
			expect(result.event.locals.user).toBeNull();
			expect(result.event.locals.profile).toBeNull();
			expect(result.status).toBe(404);
			expectSecurityHeaders(result);
		});

		it('serves a real Better Auth endpoint', async () => {
			const result = await call({ path: '/api/auth/get-session', cookie: adminCookie });

			expect(result.status).toBe(200);
			expect(JSON.parse(result.body).user.email).toBe('admin@example.com');
			expect(result.event.locals.user).toBeNull();
			expectSecurityHeaders(result);
		});
	});

	describe('admin gate', () => {
		it('redirects a signed-out GET /admin to sign-in with redirectTo', async () => {
			const result = await call({ path: '/admin' });

			expect(result.status).toBe(303);
			expect(result.location).toBe('/auth/sign-in?redirectTo=%2Fadmin');
			expect(result.resolved).toBe(false);
			expectSecurityHeaders(result);
		});

		it('answers 401 to a signed-out POST /admin/x', async () => {
			const result = await call({ method: 'POST', path: '/admin/x' });

			expect(result.status).toBe(401);
			expect(JSON.parse(result.body)).toEqual({ message: 'Unauthorized' });
			expect(result.resolved).toBe(false);
			expectSecurityHeaders(result);
		});

		it('sends a non-admin GET to / and answers 403 to a non-admin POST', async () => {
			const get = await call({ path: '/admin/users', cookie: memberCookie });
			expect(get.status).toBe(303);
			expect(get.location).toBe('/');
			expect(get.resolved).toBe(false);
			expectSecurityHeaders(get);

			const post = await call({ method: 'POST', path: '/admin/users', cookie: memberCookie });
			expect(post.status).toBe(403);
			expect(JSON.parse(post.body)).toEqual({ message: 'Forbidden' });
			expect(post.resolved).toBe(false);
			expectSecurityHeaders(post);
		});

		it('treats a suspended admin as a non-admin', async () => {
			const get = await call({ path: '/admin', cookie: suspendedAdminCookie });
			expect(get.status).toBe(303);
			expect(get.location).toBe('/');

			const post = await call({ method: 'POST', path: '/admin/x', cookie: suspendedAdminCookie });
			expect(post.status).toBe(403);
		});

		it('lets an active admin through', async () => {
			const result = await call({ path: '/admin', cookie: adminCookie });

			expect(result.status).toBe(200);
			expect(result.resolved).toBe(true);
			expectSecurityHeaders(result);
		});
	});

	describe('maintenance gate', () => {
		async function enableMaintenance() {
			await db()
				.insert(site_settings)
				.values({ key: 'maintenance_mode', value: 'true' })
				.onConflictDoUpdate({ target: site_settings.key, set: { value: 'true' } });
		}

		it('serves / as 503 to visitors and members, and 200 to admins', async () => {
			await enableMaintenance();

			const visitor = await call({ path: '/' });
			expect(visitor.status).toBe(503);
			expect(visitor.resolved).toBe(true);
			expect(visitor.body).toBe('page');
			expect(visitor.headers.get('Retry-After')).toBe('300');
			expect(visitor.headers.get('Cache-Control')).toBe('no-store');
			expect(visitor.event.locals.maintenanceMode).toBe(true);
			expectSecurityHeaders(visitor);

			const member = await call({ path: '/', cookie: memberCookie });
			expect(member.status).toBe(503);

			const admin = await call({ path: '/', cookie: adminCookie });
			expect(admin.status).toBe(200);
			expect(admin.event.locals.maintenanceMode).toBe(false);

			const suspendedAdmin = await call({ path: '/', cookie: suspendedAdminCookie });
			expect(suspendedAdmin.status).toBe(503);
		});

		it('keeps the status of data requests to / so client navigation works', async () => {
			await enableMaintenance();

			const result = await call({ path: '/__data.json', isDataRequest: true });

			// Not `/`, so visitors are redirected home; the data request itself
			// for `/` keeps its 200 below.
			expect(result.status).toBe(303);

			const home = await call({ path: '/', isDataRequest: true });
			expect(home.status).toBe(200);
			expect(home.event.locals.maintenanceMode).toBe(true);
		});

		it('redirects other GETs to / and answers 503 to writes', async () => {
			await enableMaintenance();

			const get = await call({ path: '/catalogue' });
			expect(get.status).toBe(303);
			expect(get.location).toBe('/');
			expect(get.resolved).toBe(false);
			expectSecurityHeaders(get);

			const post = await call({ method: 'POST', path: '/cart' });
			expect(post.status).toBe(503);
			expect(post.headers.get('Retry-After')).toBe('300');
			expect(JSON.parse(post.body).message).toMatch(/maintenance/);
			expectSecurityHeaders(post);
		});

		it('exempts the webhook, auth and admin paths', async () => {
			await enableMaintenance();

			const webhook = await call({ method: 'POST', path: '/api/webhooks/stripe' });
			expect(webhook.status).toBe(200);
			expect(webhook.resolved).toBe(true);
			expect(webhook.event.locals.maintenanceMode).toBe(false);

			const signIn = await call({ path: '/auth/sign-in' });
			expect(signIn.status).toBe(200);

			const admin = await call({ path: '/admin', cookie: adminCookie });
			expect(admin.status).toBe(200);
		});

		it('caches the flag in the services for the maintenance window', async () => {
			expect((await call({ path: '/' })).status).toBe(200);

			await enableMaintenance();
			// Same services instance: the cached `false` is still served.
			expect((await call({ path: '/' })).status).toBe(200);

			// A fresh instance (another serverless process) reads the new value.
			services = createTestServices(db());
			handle = createHandle({ getServices: async () => services, isMaintenanceExempt });
			expect((await call({ path: '/' })).status).toBe(503);
		});

		it('fails open when the settings table cannot be read', async () => {
			await enableMaintenance();
			await db().execute('DROP TABLE site_settings');

			const result = await call({ path: '/' });

			expect(result.status).toBe(200);
			expect(services.logEntries.some((entry) => entry.level === 'error')).toBe(true);
		});
	});
});
