import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import {
	createTestServices,
	signInCookie,
	type TestServices
} from '../../../../../tests/helpers/services.ts';
import { schema } from '#lib/server/db/index.ts';
import { APIError } from 'better-auth/api';
import { ADMIN_PASSWORD_REQUIRED_ERROR, ADMIN_REFUSED_SIGN_IN_PATHS } from './create-auth.ts';

// The sveltekitCookies plugin asks SvelteKit for the current request event to
// copy cookies onto it; outside a request there is none and it does nothing.
vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { profiles, sessions } = schema;

const EMAIL = 'member@example.com';
const PASSWORD = 'original-password';

describe('createAuth on PGlite', () => {
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

	it('signInEmail with the right password returns the session and a set-cookie header', async () => {
		const { headers, response } = await services.auth.api.signInEmail({
			body: { email: EMAIL, password: PASSWORD },
			returnHeaders: true
		});

		expect(response.user.id).toBe(userId);
		expect(response.token).toBeTruthy();
		const setCookie = headers.get('set-cookie');
		expect(setCookie).toContain('better-auth.session_token=');
		expect(setCookie).toMatch(/HttpOnly/i);

		const stored = await db().select().from(sessions).where(eq(sessions.userId, userId));
		expect(stored).toHaveLength(1);
	});

	it('the cookie resolves back to the user through getSession', async () => {
		const cookie = await signInCookie(services, EMAIL, PASSWORD);

		const session = await services.auth.api.getSession({ headers: new Headers({ cookie }) });

		expect(session?.user.id).toBe(userId);
		expect(session?.user.email).toBe(EMAIL);
	});

	it('rejects a wrong password and an unknown email', async () => {
		await expect(
			services.auth.api.signInEmail({ body: { email: EMAIL, password: 'wrong-password' } })
		).rejects.toMatchObject({ status: 'UNAUTHORIZED' });

		await expect(
			services.auth.api.signInEmail({ body: { email: 'nobody@example.com', password: PASSWORD } })
		).rejects.toMatchObject({ status: 'UNAUTHORIZED' });
		expect(await db().select().from(sessions)).toHaveLength(0);
	});

	it('refuses public sign-up (disableSignUp)', async () => {
		await expect(
			services.auth.api.signUpEmail({
				body: { email: 'new@example.com', password: 'whatever-password', name: 'New' }
			})
		).rejects.toMatchObject({ status: 'BAD_REQUEST' });
	});

	it('requestPasswordReset hands the callback a reset URL carrying a token', async () => {
		await services.auth.api.requestPasswordReset({
			body: { email: EMAIL, redirectTo: '/auth/reset-password' }
		});

		expect(services.resetEmails).toHaveLength(1);
		const { to, url } = services.resetEmails[0];
		expect(to).toBe(EMAIL);
		const parsed = new URL(url);
		expect(parsed.origin).toBe('http://localhost:5173');
		expect(parsed.pathname).toBe('/auth/reset-password');
		expect(parsed.searchParams.get('token')).toMatch(/\S+/);
	});

	it('resetPassword changes the password and revokes existing sessions', async () => {
		const oldCookie = await signInCookie(services, EMAIL, PASSWORD);
		expect(
			(await services.auth.api.getSession({ headers: new Headers({ cookie: oldCookie }) }))?.user.id
		).toBe(userId);

		await services.auth.api.requestPasswordReset({
			body: { email: EMAIL, redirectTo: '/auth/reset-password' }
		});
		const token = new URL(services.resetEmails[0].url).searchParams.get('token');
		expect(token).toBeTruthy();

		await services.auth.api.resetPassword({
			body: { newPassword: 'brand-new-password', token: token as string }
		});

		// The old session cookie no longer resolves and its row is gone.
		expect(
			await services.auth.api.getSession({ headers: new Headers({ cookie: oldCookie }) })
		).toBeNull();
		expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);

		// Old password refused, new one accepted.
		await expect(
			services.auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })
		).rejects.toMatchObject({ status: 'UNAUTHORIZED' });
		const signedIn = await services.auth.api.signInEmail({
			body: { email: EMAIL, password: 'brand-new-password' }
		});
		expect(signedIn.user.id).toBe(userId);
	});

	it('rejects a reset token that was already used', async () => {
		await services.auth.api.requestPasswordReset({
			body: { email: EMAIL, redirectTo: '/auth/reset-password' }
		});
		const token = new URL(services.resetEmails[0].url).searchParams.get('token') as string;
		await services.auth.api.resetPassword({ body: { newPassword: 'first-new-password', token } });

		await expect(
			services.auth.api.resetPassword({ body: { newPassword: 'second-new-password', token } })
		).rejects.toMatchObject({ status: 'BAD_REQUEST' });
	});

	it('creating a user through Better Auth inserts the profiles row', async () => {
		const context = await services.auth.$context;

		const created = await context.internalAdapter.createUser(
			{
				email: 'google-user@example.com',
				name: 'Google User',
				image: 'https://example.com/avatar.png',
				emailVerified: true
			},
			{ method: 'oauth', oauth: { providerId: 'google', profile: {} } }
		);

		const [profile] = await db().select().from(profiles).where(eq(profiles.id, created.id));
		expect(profile).toMatchObject({
			email: 'google-user@example.com',
			full_name: 'Google User',
			avatar_url: 'https://example.com/avatar.png',
			is_admin: false
		});
	});

	describe('admin sessions start only through the password sign-in', () => {
		/** The six-digit code in the most recent claim email to `email`. */
		function emailedCode(email: string): string {
			const match = services.mailer.lastTo(email)?.text.match(/\b(\d{6})\b/);
			if (!match) throw new Error(`no code emailed to ${email}`);
			return match[1];
		}

		it('refuses the emailed code for an admin, who still signs in with the password', async () => {
			await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, userId));
			await services.auth.api.sendVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } });

			const refusal = await services.auth.api
				.signInEmailOTP({ body: { email: EMAIL, otp: emailedCode(EMAIL) } })
				.catch((err: unknown) => err);

			expect(refusal).toBeInstanceOf(APIError);
			expect(refusal).toMatchObject({
				status: 'FORBIDDEN',
				body: { code: ADMIN_PASSWORD_REQUIRED_ERROR }
			});
			expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toEqual([]);

			// The password path is the one the two-factor plugin guards.
			const { response } = await services.auth.api.signInEmail({
				body: { email: EMAIL, password: PASSWORD },
				returnHeaders: true
			});
			expect(response.user.id).toBe(userId);
			expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
		});

		it('covers both Google endpoints with the same rule', () => {
			// Better Auth's OAuth callback is declared as "/callback/:id"; the
			// id-token variant of sign-in creates the session in "/sign-in/social".
			expect(ADMIN_REFUSED_SIGN_IN_PATHS).toEqual(
				expect.arrayContaining(['/callback/:id', '/sign-in/social'])
			);
		});

		it('lets a member sign in with the emailed code', async () => {
			await services.auth.api.sendVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } });

			const result = await services.auth.api.signInEmailOTP({
				body: { email: EMAIL, otp: emailedCode(EMAIL) }
			});

			expect(result.user.id).toBe(userId);
			expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
		});
	});
});
