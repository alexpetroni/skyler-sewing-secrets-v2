import { eq } from 'drizzle-orm';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { requireActiveMember, resolveAccess } from '../../src/lib/server/modules/auth/index.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { profiles } = schema;

describe('requireActiveMember', () => {
	const { db } = useTestDb();

	/** An event as the hook pipeline would leave it for the given user. */
	async function eventFor(seeded: SeededCatalog, userId: string | null, path = '/library') {
		const { services } = seeded;
		const profile = userId ? await services.users.getProfile(userId) : null;
		const allAccess = userId ? await services.entitlements.hasAllAccess(userId) : false;
		return fakeEvent({
			url: path,
			locals: {
				services,
				user: profile
					? {
							id: profile.id,
							email: profile.email,
							name: profile.full_name ?? '',
							emailVerified: false,
							twoFactorEnabled: false,
							createdAt: new Date(profile.created_at),
							updatedAt: new Date(profile.updated_at)
						}
					: null,
				profile,
				access: resolveAccess(profile, allAccess)
			}
		});
	}

	async function outcome(promise: Promise<unknown>) {
		return promise.then(
			() => 'allowed',
			(e: unknown) => {
				if (isRedirect(e)) return `redirect ${e.status} ${e.location}`;
				if (isHttpError(e)) return `error ${e.status}`;
				throw e;
			}
		);
	}

	it('lets the all-access member and the bundle owner through', async () => {
		const seeded = await seedCatalog(db());
		const member = await requireActiveMember(await eventFor(seeded, seeded.users.member.id));
		expect(member.user.id).toBe(seeded.users.member.id);
		expect(member.profile.is_member).toBe(true);

		const owner = await requireActiveMember(await eventFor(seeded, seeded.users.bundleOwner.id));
		expect(owner.profile.is_member).toBe(false);
	});

	it('sends signed-out visitors to sign-in with the return path', async () => {
		const seeded = await seedCatalog(db());
		expect(await outcome(requireActiveMember(await eventFor(seeded, null, '/course/basics')))).toBe(
			'redirect 303 /auth/sign-in?redirectTo=%2Fcourse%2Fbasics'
		);
		expect(await outcome(requireActiveMember(await eventFor(seeded, null), '/library'))).toBe(
			'redirect 303 /auth/sign-in?redirectTo=%2Flibrary'
		);
	});

	it('sends an account that owns nothing to the catalogue', async () => {
		const seeded = await seedCatalog(db());
		expect(await outcome(requireActiveMember(await eventFor(seeded, seeded.users.nobody.id)))).toBe(
			'redirect 303 /catalogue'
		);
	});

	it('refuses a suspended owner with 403, whatever they own', async () => {
		const seeded = await seedCatalog(db());
		await db()
			.update(profiles)
			.set({ is_suspended: true })
			.where(eq(profiles.id, seeded.users.member.id));

		const event = await eventFor(seeded, seeded.users.member.id);
		expect(event.locals.access.allAccess).toBe(false);
		expect(await outcome(requireActiveMember(event))).toBe('error 403');
	});
});
