import { eq } from 'drizzle-orm';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { actions, load } from '../../src/routes/(auth)/auth/sign-in/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent, type FakeEvent } from '../helpers/event.ts';
import { createTestServices, signInCookie, type TestServices } from '../helpers/services.ts';

// The sveltekitCookies plugin copies Better Auth's cookies onto the current
// request event; the test hands it the fake event of the action under test.
const current = vi.hoisted(() => ({ event: null as unknown }));
vi.mock('$app/server', () => ({ getRequestEvent: () => current.event }));

const { profiles, sessions } = schema;

const EMAIL = 'member@example.com';
const PASSWORD = 'correct-password';

type ActionEvent = Parameters<typeof actions.default>[0];
type LoadEvent = Parameters<typeof load>[0];

describe('/auth/sign-in', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let userId: string;

	beforeEach(async () => {
		services = createTestServices(db());
		userId = await services.users.createCredentialUser({
			email: EMAIL,
			password: PASSWORD,
			fullName: 'Member'
		});
	});

	function submit(fields: Record<string, string>): {
		event: FakeEvent;
		run: () => unknown;
	} {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = fakeEvent({
			method: 'POST',
			url: '/auth/sign-in',
			body,
			locals: { services, requestId: 'req-1' }
		});
		current.event = event;
		return { event, run: () => actions.default(event as unknown as ActionEvent) };
	}

	async function expectRedirect(run: () => unknown): Promise<string> {
		let thrown: unknown;
		try {
			await run();
		} catch (err) {
			thrown = err;
		}
		if (!isRedirect(thrown)) throw new Error(`expected a redirect, got ${String(thrown)}`);
		expect(thrown.status).toBe(303);
		return thrown.location;
	}

	describe('action', () => {
		it('returns fail(400) with field errors for an empty or malformed form', async () => {
			const empty = await submit({}).run();
			expect(isActionFailure(empty)).toBe(true);
			if (!isActionFailure(empty)) return;
			expect(empty.status).toBe(400);
			expect(empty.data).toEqual({
				email: '',
				errors: { email: 'Email is required', password: 'Password is required' }
			});

			const malformed = await submit({ email: 'not-an-email', password: 'x' }).run();
			if (!isActionFailure(malformed)) throw new Error('expected a failure');
			expect(malformed.data).toEqual({
				email: 'not-an-email',
				errors: { email: 'Please enter a valid email address' }
			});
		});

		it('returns fail(400) and sets no cookie for a wrong password', async () => {
			const { event, run } = submit({ email: EMAIL, password: 'wrong-password' });

			const result = await run();

			expect(isActionFailure(result)).toBe(true);
			if (!isActionFailure(result)) return;
			expect(result.status).toBe(400);
			expect(result.data).toEqual({ email: EMAIL, error: 'Invalid email or password' });
			expect(event.setCookies).toHaveLength(0);
			expect(await db().select().from(sessions)).toHaveLength(0);
		});

		it('redirects 303 to /library with the session cookie for the right password', async () => {
			const { event, run } = submit({ email: EMAIL, password: PASSWORD });

			const location = await expectRedirect(run);

			expect(location).toBe('/library');
			const sessionCookie = event.setCookies.find((c) => c.name === 'better-auth.session_token');
			expect(sessionCookie?.value).toMatch(/\S+/);
			expect(sessionCookie?.options).toMatchObject({ httpOnly: true, path: '/' });
			expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
		});

		it('honours a same-origin redirectTo and falls back to /library for //evil.com', async () => {
			expect(
				await expectRedirect(
					submit({ email: EMAIL, password: PASSWORD, redirectTo: '/modules/x' }).run
				)
			).toBe('/modules/x');

			expect(
				await expectRedirect(
					submit({ email: EMAIL, password: PASSWORD, redirectTo: '//evil.com' }).run
				)
			).toBe('/library');

			expect(
				await expectRedirect(
					submit({ email: EMAIL, password: PASSWORD, redirectTo: 'https://evil.com' }).run
				)
			).toBe('/library');
		});

		it('sends an active admin to /admin and a suspended admin to the normal target', async () => {
			await services.users.setAdmin(userId, true, userId);
			expect(
				await expectRedirect(
					submit({ email: EMAIL, password: PASSWORD, redirectTo: '/library' }).run
				)
			).toBe('/admin');

			await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, userId));
			expect(await expectRedirect(submit({ email: EMAIL, password: PASSWORD }).run)).toBe(
				'/library'
			);
		});
	});

	describe('load', () => {
		function visit(options: { cookie?: string; search?: string; profile?: boolean } = {}) {
			const event = fakeEvent({
				url: `/auth/sign-in${options.search ?? ''}`,
				headers: options.cookie ? { cookie: options.cookie } : undefined,
				locals: { services, requestId: 'req-2', user: null, profile: null }
			});
			current.event = event;
			return event;
		}

		it('gives a visitor the sanitised redirectTo and the Google flag', async () => {
			const event = visit({ search: '?redirectTo=//evil.com' });

			expect(await load(event as unknown as LoadEvent)).toEqual({
				redirectTo: '/library',
				googleEnabled: false
			});

			const withTarget = visit({ search: '?redirectTo=%2Fmodules%2Fa' });
			expect(await load(withTarget as unknown as LoadEvent)).toMatchObject({
				redirectTo: '/modules/a'
			});
		});

		it('reports Google as enabled when it is configured', async () => {
			const googleServices = createTestServices(db(), { googleEnabled: true });
			const event = fakeEvent({
				url: '/auth/sign-in',
				locals: { services: googleServices, requestId: 'req-3', user: null, profile: null }
			});

			expect(await load(event as unknown as LoadEvent)).toMatchObject({ googleEnabled: true });
		});

		it('redirects a signed-in member to /library and an admin to /admin', async () => {
			const cookie = await signInCookie(services, EMAIL, PASSWORD);
			const session = await services.auth.api.getSession({ headers: new Headers({ cookie }) });
			await db().update(profiles).set({ is_member: true }).where(eq(profiles.id, userId));
			const member = visit({ cookie });
			member.locals.user = session?.user ?? null;
			member.locals.profile = await services.users.getProfile(userId);

			expect(await expectRedirect(() => load(member as unknown as LoadEvent))).toBe('/library');

			await services.users.setAdmin(userId, true, userId);
			const admin = visit({ cookie });
			admin.locals.user = session?.user ?? null;
			admin.locals.profile = await services.users.getProfile(userId);

			expect(await expectRedirect(() => load(admin as unknown as LoadEvent))).toBe('/admin');
		});

		it('signs out a stale session that has no profile', async () => {
			const cookie = await signInCookie(services, EMAIL, PASSWORD);
			const session = await services.auth.api.getSession({ headers: new Headers({ cookie }) });
			await db().delete(profiles).where(eq(profiles.id, userId));
			const event = visit({ cookie });
			event.locals.user = session?.user ?? null;
			event.locals.profile = null;

			const data = await load(event as unknown as LoadEvent);

			expect(data).toEqual({ redirectTo: '/library', googleEnabled: false });
			expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
			const cleared = event.setCookies.find((c) => c.name === 'better-auth.session_token');
			expect(cleared?.options).toMatchObject({ maxAge: 0 });
		});
	});
});
