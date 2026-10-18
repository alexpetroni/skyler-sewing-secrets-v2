import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { actions, load } from '../../src/routes/admin/security/+page.server.ts';
import { failed } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { createTestServices, signInCookie, type TestServices } from '../helpers/services.ts';
import { cookieHeader, totpCode } from '../helpers/two-factor.ts';

// The sveltekitCookies plugin copies Better Auth's cookies onto the current
// request event; the test hands it the fake event of the action under test.
const current = vi.hoisted(() => ({ event: null as unknown }));
vi.mock('$app/server', () => ({ getRequestEvent: () => current.event }));

const { profiles, users, twoFactors } = schema;

type ActionName = keyof typeof actions;
type ActionEvent = Parameters<(typeof actions)['enable']>[0];
type LoadEvent = Parameters<typeof load>[0];
type PageData = Exclude<Awaited<ReturnType<typeof load>>, void>;
interface SetupResult {
	setup: { qrDataUrl: string; secret: string; backupCodes: string[] };
}
interface MessageResult {
	form: { message?: string };
}

const EMAIL = 'owner@example.com';

describe('/admin/security', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;
	let cookie: string;

	beforeEach(async () => {
		services = createTestServices(db());
		adminId = await services.users.createCredentialUser({
			email: EMAIL,
			password: FIXTURE_PASSWORD,
			fullName: 'Owner'
		});
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, adminId));
		cookie = await signInCookie(services, EMAIL, FIXTURE_PASSWORD);
	});

	async function submit(userId: string | null, action: ActionName, fields: Record<string, string>) {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = await memberEvent(services, userId, {
			method: 'POST',
			url: `/admin/security?/${action}`,
			headers: { cookie },
			body
		});
		current.event = event;
		const result = await outcome(() => actions[action](event as unknown as ActionEvent));
		// Better Auth rotates the session when two-factor changes; keep following it.
		cookie = cookieHeader(event, cookie);
		return result;
	}

	const flag = async () =>
		(await db().select({ on: users.twoFactorEnabled }).from(users).where(eq(users.id, adminId)))[0]
			.on;

	it('loads for an admin, saying whether two-factor is on and whether it was demanded', async () => {
		const plain = await memberEvent(services, adminId, { url: '/admin/security' });
		const page = (await load(plain as unknown as LoadEvent)) as PageData;
		expect(page.enabled).toBe(false);
		expect(page.required).toBe(false);
		expect(Object.keys(page.forms).sort()).toEqual(['disable', 'enable', 'verify']);

		const demanded = await memberEvent(services, adminId, { url: '/admin/security?required=1' });
		expect(((await load(demanded as unknown as LoadEvent)) as PageData).required).toBe(true);

		const nobody = await services.users.createCredentialUser({
			email: 'nobody@example.com',
			password: FIXTURE_PASSWORD
		});
		expect(
			await outcome(async () =>
				load(
					(await memberEvent(services, nobody, { url: '/admin/security' })) as unknown as LoadEvent
				)
			)
		).toBe('redirect 303 /');
		expect(await submit(nobody, 'enable', { password: FIXTURE_PASSWORD })).toBe('error 403');
		expect(await submit(null, 'verify', { code: '000000' })).toBe('error 401');
	});

	it('enables after the password and the first code, showing the QR, secret and backup codes once', async () => {
		const wrong = failed(await submit(adminId, 'enable', { password: 'not-it' }));
		expect(wrong.status).toBe(400);
		expect(wrong.form.errors.password).toEqual(['Incorrect password']);
		expect(await flag()).toBe(false);

		const empty = failed(await submit(adminId, 'enable', {}));
		expect(empty.form.errors.password).toEqual(['Password is required']);

		const { setup } = (await submit(adminId, 'enable', {
			password: FIXTURE_PASSWORD
		})) as SetupResult;
		expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
		expect(setup.secret).toMatch(/^[A-Z2-7]{20,}$/);
		expect(setup.backupCodes).toHaveLength(10);
		for (const code of setup.backupCodes) expect(code).toMatch(/^[a-z0-9-]{6,}$/i);
		// Not on until the first code proves the app has the secret.
		expect(await flag()).toBe(false);

		const bad = failed(await submit(adminId, 'verify', { code: '000000' }));
		expect(bad.status).toBe(400);
		expect(bad.form.errors.code).toEqual(['That code is not valid']);
		expect(await flag()).toBe(false);

		const good = (await submit(adminId, 'verify', {
			code: await totpCode(setup.secret)
		})) as MessageResult;
		expect(good.form.message).toBe('Two-factor authentication is on.');
		expect(await flag()).toBe(true);
		const [row] = await db().select().from(twoFactors).where(eq(twoFactors.userId, adminId));
		expect(row.verified).toBe(true);

		// Already on: a second setup is refused rather than silently replacing the secret.
		const again = failed(await submit(adminId, 'enable', { password: FIXTURE_PASSWORD }));
		expect(again.form.errors._errors).toEqual(['Two-factor authentication is already on']);
	});

	it('disables with the password and a current code', async () => {
		const { setup } = (await submit(adminId, 'enable', {
			password: FIXTURE_PASSWORD
		})) as SetupResult;
		await submit(adminId, 'verify', { code: await totpCode(setup.secret) });
		expect(await flag()).toBe(true);

		const badCode = failed(
			await submit(adminId, 'disable', { password: FIXTURE_PASSWORD, code: '000000' })
		);
		expect(badCode.form.errors.code).toEqual(['That code is not valid']);
		expect(await flag()).toBe(true);

		const badPassword = failed(
			await submit(adminId, 'disable', { password: 'not-it', code: await totpCode(setup.secret) })
		);
		expect(badPassword.form.errors.password).toEqual(['Incorrect password']);
		expect(await flag()).toBe(true);

		const off = (await submit(adminId, 'disable', {
			password: FIXTURE_PASSWORD,
			code: await totpCode(setup.secret)
		})) as MessageResult;
		expect(off.form.message).toBe('Two-factor authentication is off.');
		expect(await flag()).toBe(false);
		expect(await db().select().from(twoFactors).where(eq(twoFactors.userId, adminId))).toEqual([]);
	});
});
