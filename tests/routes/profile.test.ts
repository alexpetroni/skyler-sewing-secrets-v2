import { eq } from 'drizzle-orm';
import { isActionFailure } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { actions, load } from '../../src/routes/(member)/profile/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD, seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { signInCookie } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { profiles, sessions } = schema;

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<typeof actions.updateProfile>[0];
type ProfileData = Exclude<Awaited<ReturnType<typeof load>>, void>;

describe('/profile', () => {
	const { db } = useTestDb();

	async function submit(
		seeded: SeededCatalog,
		userId: string | null,
		action: 'updateProfile' | 'signOutEverywhere',
		fields: Record<string, string> = {}
	) {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: `/profile?/${action}`,
			body
		});
		return outcome(() => actions[action](event as unknown as ActionEvent));
	}

	it('lists owned products with dates and requires a signed-in account', async () => {
		const seeded = await seedCatalog(db());
		const { member, nobody } = seeded.users;

		const event = await memberEvent(seeded.services, member.id, { url: '/profile' });
		const page = (await load(event as unknown as LoadEvent)) as ProfileData;
		expect(page.allAccess).toBe(true);
		expect(page.profile).toMatchObject({ email: member.email, fullName: 'Member' });
		expect(page.owned).toEqual([
			{
				id: expect.any(String),
				title: 'the-course',
				slug: 'the-course',
				kind: 'course',
				grantedAt: expect.any(String)
			}
		]);

		const empty = (await load(
			(await memberEvent(seeded.services, nobody.id, { url: '/profile' })) as unknown as LoadEvent
		)) as ProfileData;
		expect(empty.owned).toEqual([]);
		expect(empty.allAccess).toBe(false);

		const anonymous = await memberEvent(seeded.services, null, { url: '/profile' });
		expect(await outcome(() => load(anonymous as unknown as LoadEvent))).toBe(
			'redirect 303 /auth/sign-in?redirectTo=%2Fprofile'
		);
	});

	it('updates the name and returns the legacy messages for a bad one', async () => {
		const seeded = await seedCatalog(db());
		const { nobody } = seeded.users;

		expect(
			await submit(seeded, nobody.id, 'updateProfile', { full_name: '  Ada Lovelace ' })
		).toEqual({ success: true });
		const [row] = await db().select().from(profiles).where(eq(profiles.id, nobody.id));
		expect(row.full_name).toBe('Ada Lovelace');

		const short = await submit(seeded, nobody.id, 'updateProfile', { full_name: 'A' });
		if (!isActionFailure(short)) throw new Error('expected a failure');
		expect(short.status).toBe(400);
		expect(short.data).toEqual({ error: 'Name must be at least 2 characters', fullName: 'A' });

		const long = await submit(seeded, nobody.id, 'updateProfile', { full_name: 'x'.repeat(101) });
		if (!isActionFailure(long)) throw new Error('expected a failure');
		expect(long.data).toMatchObject({ error: 'Name must be 100 characters or fewer' });
	});

	it('signs out everywhere by deleting every session of the user', async () => {
		const seeded = await seedCatalog(db());
		const { member, nobody } = seeded.users;
		await signInCookie(seeded.services, member.email, FIXTURE_PASSWORD);
		await signInCookie(seeded.services, member.email, FIXTURE_PASSWORD);
		await signInCookie(seeded.services, nobody.email, FIXTURE_PASSWORD);
		const sessionsOf = (userId: string) =>
			db().select().from(sessions).where(eq(sessions.userId, userId));
		expect(await sessionsOf(member.id)).toHaveLength(2);

		expect(await submit(seeded, member.id, 'signOutEverywhere')).toBe('redirect 303 /auth/sign-in');
		expect(await sessionsOf(member.id)).toEqual([]);
		expect(await sessionsOf(nobody.id)).toHaveLength(1);
	});
});
