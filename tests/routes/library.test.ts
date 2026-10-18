import { describe, expect, it, vi } from 'vitest';
import { libraryPage } from '../../src/lib/server/http/member-area.ts';
import { GET as dashboard } from '../../src/routes/(member)/dashboard/+server.ts';
import { load } from '../../src/routes/(member)/library/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type LoadEvent = Parameters<typeof load>[0];
type LibraryData = Awaited<ReturnType<typeof libraryPage>> & { name: string | null };

describe('/library', () => {
	const { db } = useTestDb();

	it('groups owned products: the course by module, bundles and singles by lesson, with progress', async () => {
		const seeded = await seedCatalog(db());
		const { services, lessons } = seeded;
		const { member, bundleOwner } = seeded.users;
		await services.entitlements.grant({
			userId: member.id,
			productId: seeded.single.id,
			source: 'purchase'
		});
		await services.content.progress.upsert({
			userId: member.id,
			lessonId: lessons.first,
			completed: true
		});
		await services.content.progress.upsert({
			userId: bundleOwner.id,
			lessonId: lessons.first,
			completed: true
		});
		await services.content.progress.upsert({
			userId: bundleOwner.id,
			lessonId: lessons.second,
			positionSeconds: 150
		});

		const run = async (userId: string) => {
			const event = await memberEvent(services, userId, { url: '/library' });
			return (await load(event as unknown as LoadEvent)) as LibraryData;
		};

		const owner = await run(bundleOwner.id);
		expect(owner.name).toBe('Bundle Owner');
		expect(owner.course).toBeNull();
		expect(owner.collections).toEqual([
			{
				slug: 'basics-bundle',
				title: 'basics-bundle',
				kind: 'bundle',
				grantedAt: expect.any(String),
				lessons: [
					{
						id: lessons.first,
						title: 'first-lesson',
						href: '/modules/basics/first-lesson',
						durationSeconds: 600,
						completed: true
					},
					{
						id: lessons.second,
						title: 'second-lesson',
						href: '/modules/basics/second-lesson',
						durationSeconds: 600,
						completed: false
					}
				]
			}
		]);
		expect(owner.continueWatching).toMatchObject([
			{ lessonId: lessons.second, positionSeconds: 150, href: '/modules/basics/second-lesson' }
		]);
		expect(owner.recentlyCompleted).toMatchObject([
			{ lessonId: lessons.first, href: '/modules/basics/first-lesson' }
		]);
		// 10 minutes completed + 2.5 minutes watched.
		expect(owner.summary).toEqual({
			products: 1,
			lessons: 2,
			completedLessons: 1,
			minutesWatched: 12
		});

		const allAccess = await run(member.id);
		expect(allAccess.course).toMatchObject({
			slug: 'the-course',
			title: 'the-course',
			modules: [{ slug: 'basics', title: 'Basics', totalLessons: 2, completedLessons: 1 }]
		});
		expect(allAccess.collections).toMatchObject([
			{
				slug: 'standalone-video',
				kind: 'single',
				lessons: [{ id: lessons.standalone, href: '/videos/standalone-video', completed: false }]
			}
		]);
		expect(allAccess.summary).toEqual({
			products: 2,
			lessons: 3,
			completedLessons: 1,
			minutesWatched: 10
		});
	});

	it('sends anonymous visitors to sign-in and owners of nothing to the catalogue', async () => {
		const seeded = await seedCatalog(db());

		const anonymous = await memberEvent(seeded.services, null, { url: '/library' });
		expect(await outcome(() => load(anonymous as unknown as LoadEvent))).toBe(
			'redirect 303 /auth/sign-in?redirectTo=%2Flibrary'
		);

		const nobody = await memberEvent(seeded.services, seeded.users.nobody.id, { url: '/library' });
		expect(await outcome(() => load(nobody as unknown as LoadEvent))).toBe(
			'redirect 303 /catalogue'
		);
	});

	it('/dashboard moves permanently to /library', async () => {
		const seeded = await seedCatalog(db());
		const event = await memberEvent(seeded.services, null, { url: '/dashboard' });
		expect(
			await outcome(() => dashboard(event as unknown as Parameters<typeof dashboard>[0]))
		).toBe('redirect 301 /library');
	});
});
