import { eq } from 'drizzle-orm';
import { isActionFailure, isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { resolveAccess } from '../../src/lib/server/modules/auth/index.ts';
import { actions, load } from '../../src/routes/(member)/leave-review/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { profiles, testimonials } = schema;

type ActionEvent = Parameters<typeof actions.submit>[0];
type LoadEvent = Parameters<typeof load>[0];

const REVIEW = 'The pressing module alone was worth it.';

describe('/leave-review', () => {
	const { db } = useTestDb();

	/** An event as the hook pipeline would leave it for the given user. */
	async function eventFor(
		seeded: SeededCatalog,
		userId: string | null,
		fields?: Record<string, string>
	) {
		const { services } = seeded;
		const profile = userId ? await services.users.getProfile(userId) : null;
		const allAccess = userId ? await services.entitlements.hasAllAccess(userId) : false;
		let body: FormData | undefined;
		if (fields) {
			body = new FormData();
			for (const [name, value] of Object.entries(fields)) body.set(name, value);
		}
		return fakeEvent({
			method: fields ? 'POST' : 'GET',
			url: fields ? '/leave-review?/submit' : '/leave-review',
			body,
			locals: {
				services,
				requestId: 'req-1',
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

	async function outcome(run: () => unknown): Promise<unknown> {
		try {
			return await run();
		} catch (e) {
			if (isRedirect(e)) return `redirect ${e.status} ${e.location}`;
			if (isHttpError(e)) return `error ${e.status}`;
			throw e;
		}
	}

	const submit = async (
		seeded: SeededCatalog,
		userId: string | null,
		fields: Record<string, string>
	) => {
		const event = await eventFor(seeded, userId, fields);
		return outcome(() => actions.submit(event as unknown as ActionEvent));
	};

	const rowsFor = (userId: string) =>
		db().select().from(testimonials).where(eq(testimonials.user_id, userId));

	it('stores an unpublished review for an owner and redirects to the profile', async () => {
		const seeded = await seedCatalog(db());
		const { bundleOwner } = seeded.users;

		expect(
			await submit(seeded, bundleOwner.id, {
				content: REVIEW,
				rating: '4',
				author_title: ' Quilter '
			})
		).toBe('redirect 303 /profile?review=submitted');
		expect(await rowsFor(bundleOwner.id)).toMatchObject([
			{ content: REVIEW, rating: 4, author_title: 'Quilter', is_published: false }
		]);

		const page = await outcome(async () =>
			load((await eventFor(seeded, bundleOwner.id)) as unknown as LoadEvent)
		);
		expect(page).toMatchObject({ testimonial: { content: REVIEW, rating: 4 } });
	});

	it('returns the legacy validation messages', async () => {
		const seeded = await seedCatalog(db());
		const { member } = seeded.users;

		const short = await submit(seeded, member.id, { content: 'Too short', rating: '5' });
		if (!isActionFailure(short)) throw new Error('expected a failure');
		expect(short.status).toBe(400);
		expect(short.data).toMatchObject({
			error: 'Review must be at least 20 characters long.',
			values: { content: 'Too short', rating: '5' }
		});

		const long = await submit(seeded, member.id, { content: 'x'.repeat(1001), rating: '5' });
		if (!isActionFailure(long)) throw new Error('expected a failure');
		expect(long.data).toMatchObject({ error: 'Review must be less than 1000 characters.' });

		for (const rating of ['', '0', '6', '2.5', 'abc']) {
			const bad = await submit(seeded, member.id, { content: REVIEW, rating });
			if (!isActionFailure(bad)) throw new Error(`expected a failure for rating ${rating}`);
			expect(bad.data).toMatchObject({ error: 'Please select a rating between 1 and 5 stars.' });
		}
		expect(await rowsFor(member.id)).toEqual([]);
	});

	it('refuses to edit a review once it is published', async () => {
		const seeded = await seedCatalog(db());
		const { member } = seeded.users;
		await submit(seeded, member.id, { content: REVIEW, rating: '5' });
		const [row] = await rowsFor(member.id);
		await db().update(testimonials).set({ is_published: true }).where(eq(testimonials.id, row.id));

		const result = await submit(seeded, member.id, {
			content: 'A different text after publishing.',
			rating: '1'
		});

		if (!isActionFailure(result)) throw new Error('expected a failure');
		expect(result.data).toMatchObject({
			error: 'Your review has already been published and cannot be edited.'
		});
		expect(await rowsFor(member.id)).toMatchObject([{ content: REVIEW, rating: 5 }]);
	});

	it('gates load and action: sign-in, catalogue for owners of nothing, 403 when suspended', async () => {
		const seeded = await seedCatalog(db());
		const { member, nobody } = seeded.users;
		const fields = { content: REVIEW, rating: '5' };

		expect(await submit(seeded, null, fields)).toBe(
			'redirect 303 /auth/sign-in?redirectTo=%2Fleave-review'
		);
		expect(await submit(seeded, nobody.id, fields)).toBe('redirect 303 /catalogue');
		expect(
			await outcome(async () => load((await eventFor(seeded, nobody.id)) as unknown as LoadEvent))
		).toBe('redirect 303 /catalogue');

		await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, member.id));
		expect(await submit(seeded, member.id, fields)).toBe('error 403');
		expect(
			await outcome(async () => load((await eventFor(seeded, member.id)) as unknown as LoadEvent))
		).toBe('error 403');

		expect(await db().select().from(testimonials)).toEqual([]);
	});
});
