import { eq } from 'drizzle-orm';
import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { actions as signInActions } from '../../src/routes/(auth)/auth/sign-in/+page.server.ts';
import { actions, load } from '../../src/routes/(auth)/auth/two-factor/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent, type FakeEvent } from '../helpers/event.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';
import { cookieHeader, enableTotp, totpCode, type TotpAccount } from '../helpers/two-factor.ts';

const current = vi.hoisted(() => ({ event: null as unknown }));
vi.mock('$app/server', () => ({ getRequestEvent: () => current.event }));

const { profiles, sessions } = schema;

type SignInEvent = Parameters<typeof signInActions.default>[0];
type ActionEvent = Parameters<typeof actions.default>[0];
type LoadEvent = Parameters<typeof load>[0];

const EMAIL = 'member@example.com';
const PASSWORD = 'correct-password';

describe('/auth/two-factor', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let userId: string;
	let totp: TotpAccount;

	beforeEach(async () => {
		services = createTestServices(db());
		userId = await services.users.createCredentialUser({
			email: EMAIL,
			password: PASSWORD,
			fullName: 'Member'
		});
		totp = await enableTotp(services, EMAIL, PASSWORD);
		// The sign-ins below start from a clean slate.
		await services.users.revokeAllSessions(userId);
	});

	function post(url: string, fields: Record<string, string>, cookie?: string): FakeEvent {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = fakeEvent({
			method: 'POST',
			url,
			body,
			headers: cookie ? { cookie } : undefined,
			locals: { services, requestId: 'req-1' }
		});
		current.event = event;
		return event;
	}

	/** Step one: the password is right, so Better Auth parks the sign-in behind its two-factor cookie. */
	async function firstStep(redirectTo = '/library'): Promise<string> {
		const event = post('/auth/sign-in', { email: EMAIL, password: PASSWORD, redirectTo });
		expect(await outcome(() => signInActions.default(event as unknown as SignInEvent))).toBe(
			`redirect 303 /auth/two-factor?redirectTo=${encodeURIComponent(redirectTo)}`
		);
		expect(event.setCookies.map((cookie) => cookie.name)).toContain('better-auth.two_factor');
		expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);
		return cookieHeader(event);
	}

	async function secondStep(fields: Record<string, string>, cookie: string) {
		const event = post('/auth/two-factor', fields, cookie);
		return { event, result: await outcome(() => actions.default(event as unknown as ActionEvent)) };
	}

	it('completes the sign-in with a code from the app, keeping the redirect target', async () => {
		const cookie = await firstStep('/modules/intro');
		const { event, result } = await secondStep(
			{ code: await totpCode(totp.secret), method: 'totp', redirectTo: '/modules/intro' },
			cookie
		);
		expect(result).toBe('redirect 303 /modules/intro');
		expect(event.setCookies.map((cookie) => cookie.name)).toContain('better-auth.session_token');
		expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
	});

	it('sends an admin to /admin and anyone else to the safe target', async () => {
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, userId));
		const cookie = await firstStep();
		const { result } = await secondStep({ code: await totpCode(totp.secret) }, cookie);
		expect(result).toBe('redirect 303 /admin');

		await db().update(profiles).set({ is_admin: false }).where(eq(profiles.id, userId));
		await services.users.revokeAllSessions(userId);
		const again = await firstStep();
		const { result: elsewhere } = await secondStep(
			{ code: await totpCode(totp.secret), redirectTo: 'https://evil.example' },
			again
		);
		expect(elsewhere).toBe('redirect 303 /library');
	});

	it('refuses a wrong code, a missing cookie and an empty form', async () => {
		const cookie = await firstStep();
		const { result: wrong } = await secondStep({ code: '000000' }, cookie);
		if (!isActionFailure(wrong)) throw new Error('expected a failure');
		expect(wrong.status).toBe(400);
		expect(wrong.data).toEqual({ method: 'totp', error: 'That code is not valid' });
		expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);

		const { result: noCookie } = await secondStep({ code: await totpCode(totp.secret) }, '');
		if (!isActionFailure(noCookie)) throw new Error('expected a failure');
		expect(noCookie.data).toEqual({
			method: 'totp',
			error: 'Your sign-in has expired. Please sign in again.'
		});

		const { result: empty } = await secondStep({ method: 'backup' }, cookie);
		if (!isActionFailure(empty)) throw new Error('expected a failure');
		expect(empty.data).toEqual({ method: 'backup', errors: { code: 'Enter the code' } });
	});

	it('accepts a backup code once', async () => {
		const [code] = totp.backupCodes;
		const cookie = await firstStep();
		const { result } = await secondStep({ code, method: 'backup' }, cookie);
		expect(result).toBe('redirect 303 /library');

		await services.users.revokeAllSessions(userId);
		const again = await firstStep();
		const { result: reused } = await secondStep({ code, method: 'backup' }, again);
		if (!isActionFailure(reused)) throw new Error('expected a failure');
		expect(reused.data).toEqual({ method: 'backup', error: 'That backup code is not valid' });
	});

	it('load offers the safe redirect target and sends signed-in users on', async () => {
		const anonymous = await memberEvent(services, null, {
			url: '/auth/two-factor?redirectTo=https://evil.example'
		});
		expect(await load(anonymous as unknown as LoadEvent)).toEqual({ redirectTo: '/library' });

		const signedIn = await memberEvent(services, userId, { url: '/auth/two-factor' });
		expect(await outcome(() => load(signedIn as unknown as LoadEvent))).toBe(
			'redirect 303 /library'
		);
	});
});
