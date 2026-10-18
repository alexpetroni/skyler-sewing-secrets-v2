import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import {
	courseOutlinePage,
	modulePage as modulePageData
} from '../../src/lib/server/http/member-area.ts';
import { load as loadModule } from '../../src/routes/(member)/modules/[moduleSlug]/+page.server.ts';
import { load as loadOutline } from '../../src/routes/(member)/modules/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { lessons, profiles } = schema;

type OutlineEvent = Parameters<typeof loadOutline>[0];
type ModuleEvent = Parameters<typeof loadModule>[0];
type OutlineData = Awaited<ReturnType<typeof courseOutlinePage>>;
type ModuleData = NonNullable<Awaited<ReturnType<typeof modulePageData>>>;

describe('/modules', () => {
	const { db } = useTestDb();

	async function outline(seeded: SeededCatalog, userId: string | null) {
		const event = await memberEvent(seeded.services, userId, { url: '/modules' });
		return (await loadOutline(event as unknown as OutlineEvent)) as OutlineData;
	}

	async function modulePage(seeded: SeededCatalog, userId: string | null, slug = 'basics') {
		const event = await memberEvent(seeded.services, userId, {
			url: `/modules/${slug}`,
			params: { moduleSlug: slug }
		});
		return outcome(async () => (await loadModule(event as unknown as ModuleEvent)) as ModuleData);
	}

	it('shows the outline to anonymous visitors with lock states and the flagship to buy', async () => {
		const seeded = await seedCatalog(db());
		await db()
			.update(lessons)
			.set({ is_free_preview: true })
			.where(eq(lessons.id, seeded.lessons.first));

		const page = await outline(seeded, null);
		expect(page.flagship).toEqual({ slug: 'the-course', title: 'the-course' });
		expect(page.ownsCourse).toBe(false);
		expect(page.modules).toMatchObject([
			{
				slug: 'basics',
				owned: false,
				lessons: [
					{ id: seeded.lessons.first, lockState: 'open', isFreePreview: true },
					{ id: seeded.lessons.second, lockState: 'locked' }
				]
			}
		]);
	});

	it('marks owned lessons open with progress and a suspended account as suspended', async () => {
		const seeded = await seedCatalog(db());
		const { bundleOwner, member } = seeded.users;
		await seeded.services.content.progress.upsert({
			userId: bundleOwner.id,
			lessonId: seeded.lessons.second,
			completed: true
		});

		const owner = await outline(seeded, bundleOwner.id);
		expect(owner.ownsCourse).toBe(true);
		expect(owner.modules[0].lessons.map((lesson) => [lesson.lockState, lesson.completed])).toEqual([
			['open', false],
			['open', true]
		]);

		await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, member.id));
		const suspended = await outline(seeded, member.id);
		expect(suspended.ownsCourse).toBe(false);
		expect(suspended.modules[0].lessons.map((lesson) => lesson.lockState)).toEqual([
			'suspended',
			'suspended'
		]);
	});

	it('/modules/[slug] lists the published lessons with links and 404s an unknown module', async () => {
		const seeded = await seedCatalog(db());
		await seeded.services.content.lessons.create({
			moduleId: seeded.moduleId,
			title: 'Draft',
			slug: 'draft',
			kind: 'article',
			mediaAssetId: null,
			description: '',
			contentMd: '',
			isFreePreview: false,
			isPublished: false,
			orderIndex: 5
		});

		const anonymous = await modulePage(seeded, null);
		if (typeof anonymous === 'string') throw new Error(anonymous);
		expect(anonymous.module).toMatchObject({ slug: 'basics', title: 'Basics' });
		expect(anonymous.owned).toBe(false);
		expect(
			anonymous.lessons.map((lesson) => [lesson.href, lesson.lockState, lesson.durationSeconds])
		).toEqual([
			['/modules/basics/first-lesson', 'locked', 600],
			['/modules/basics/second-lesson', 'locked', 600]
		]);

		const member = await modulePage(seeded, seeded.users.member.id);
		if (typeof member === 'string') throw new Error(member);
		expect(member.owned).toBe(true);
		expect(member.lessons.every((lesson) => lesson.lockState === 'open')).toBe(true);

		expect(await modulePage(seeded, null, 'no-such-module')).toBe('error 404');
	});
});
