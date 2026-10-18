import { eq } from 'drizzle-orm';
import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { LessonPage } from '../../src/lib/components/course/types.ts';
import { schema } from '../../src/lib/server/db/index.ts';
import { SUSPENDED_MESSAGE } from '../../src/lib/server/modules/auth/index.ts';
import { load as loadModuleLesson } from '../../src/routes/(member)/modules/[moduleSlug]/[lessonSlug]/+page.server.ts';
import { load as loadVideo } from '../../src/routes/(member)/videos/[slug]/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { lessons, media_assets, profiles } = schema;

type ModuleLessonEvent = Parameters<typeof loadModuleLesson>[0];
type VideoEvent = Parameters<typeof loadVideo>[0];

const EMBED_PREFIX = 'https://iframe.mediadelivery.net/embed/100/';

describe('lesson pages', () => {
	const { db } = useTestDb();

	async function moduleLesson(
		seeded: SeededCatalog,
		userId: string | null,
		lessonSlug: string,
		moduleSlug = 'basics'
	) {
		const url = `/modules/${moduleSlug}/${lessonSlug}`;
		const event = await memberEvent(seeded.services, userId, {
			url,
			params: { moduleSlug, lessonSlug }
		});
		return outcome(
			async () => (await loadModuleLesson(event as unknown as ModuleLessonEvent)) as LessonPage
		);
	}

	async function video(seeded: SeededCatalog, userId: string | null, slug: string) {
		const event = await memberEvent(seeded.services, userId, {
			url: `/videos/${slug}`,
			params: { slug }
		});
		return outcome(async () => (await loadVideo(event as unknown as VideoEvent)) as LessonPage);
	}

	function asPage(result: LessonPage | string): LessonPage {
		if (typeof result === 'string') throw new Error(`expected page data, got ${result}`);
		return result;
	}

	async function addResource(seeded: SeededCatalog, lessonId: string) {
		return seeded.services.content.resources.add({
			lessonId,
			title: 'Pattern',
			fileUrl: 'https://files.example.com/pattern.pdf',
			fileType: 'application/pdf',
			fileSizeBytes: 2048
		});
	}

	it('locks a paid lesson for an anonymous visitor: no embed, no resources, unlock options', async () => {
		const seeded = await seedCatalog(db());
		await addResource(seeded, seeded.lessons.first);

		const page = asPage(await moduleLesson(seeded, null, 'first-lesson'));
		expect(page.locked).toBe(true);
		expect(page).not.toHaveProperty('embedUrl');
		expect(page).not.toHaveProperty('resources');
		expect(page).not.toHaveProperty('contentHtml');
		if (!page.locked) throw new Error('expected a locked page');
		expect(page.unlockOptions).toEqual({
			cheapest: {
				id: seeded.bundle.id,
				slug: 'basics-bundle',
				title: 'basics-bundle',
				kind: 'bundle',
				pricing: { price: 2900, listPrice: 2900, onSale: false }
			},
			flagship: {
				id: seeded.flagship.id,
				slug: 'the-course',
				title: 'the-course',
				kind: 'course',
				pricing: { price: 14900, listPrice: 14900, onSale: false }
			}
		});
		expect(page.signInHref).toBe('/auth/sign-in?redirectTo=%2Fmodules%2Fbasics%2Ffirst-lesson');

		// The standalone video's cheapest option is its single.
		const standalone = asPage(await video(seeded, null, 'standalone-video'));
		if (!standalone.locked) throw new Error('expected a locked page');
		expect(standalone.unlockOptions.cheapest?.slug).toBe('standalone-video');
		expect(standalone.unlockOptions.cheapest?.pricing.price).toBe(900);
		expect(standalone.unlockOptions.flagship?.slug).toBe('the-course');
	});

	it('opens a bundle lesson for its owner with a signed embed and the resources', async () => {
		const seeded = await seedCatalog(db());
		const resource = await addResource(seeded, seeded.lessons.second);
		const owner = seeded.users.bundleOwner.id;
		await seeded.services.content.progress.upsert({
			userId: owner,
			lessonId: seeded.lessons.second,
			positionSeconds: 95
		});

		const page = asPage(await moduleLesson(seeded, owner, 'second-lesson'));
		if (page.locked) throw new Error('expected an open page');
		expect(page.embedUrl).toMatch(
			new RegExp(
				`^${EMBED_PREFIX}fixture-video-2\\?autoplay=false&preload=true&token=[0-9a-f]{64}&expires=\\d+$`
			)
		);
		expect(page.resources).toEqual([
			{ id: resource.id, title: 'Pattern', fileType: 'application/pdf', fileSizeBytes: 2048 }
		]);
		expect(page.startAt).toBe(95);
		expect(page.canTrackProgress).toBe(true);
		expect(page.ownsAllSiblings).toBe(true);
		expect(page.siblings.map((sibling) => [sibling.href, sibling.lockState])).toEqual([
			['/modules/basics/first-lesson', 'open'],
			['/modules/basics/second-lesson', 'open']
		]);
	});

	it('locks a lesson outside the owned bundle', async () => {
		const seeded = await seedCatalog(db());
		await addResource(seeded, seeded.lessons.standalone);

		const page = asPage(await video(seeded, seeded.users.bundleOwner.id, 'standalone-video'));
		expect(page.locked).toBe(true);
		expect(page).not.toHaveProperty('embedUrl');
		expect(page).not.toHaveProperty('resources');
		if (!page.locked) throw new Error('expected a locked page');
		expect(page.signInHref).toBeNull();
		expect(page.unlockOptions.cheapest?.slug).toBe('standalone-video');
	});

	it('opens everything for the all-access member, including a lesson added later', async () => {
		const seeded = await seedCatalog(db());
		const member = seeded.users.member.id;
		const [asset] = await db()
			.insert(media_assets)
			.values({ library_id: '100', video_id: 'added-later', status: 'ready' })
			.returning();
		await seeded.services.content.lessons.create({
			moduleId: seeded.moduleId,
			title: 'Added later',
			slug: 'added-later',
			kind: 'video',
			mediaAssetId: asset.id,
			description: '',
			contentMd: '',
			isFreePreview: false,
			isPublished: true,
			orderIndex: 2
		});

		for (const slug of ['first-lesson', 'second-lesson', 'added-later']) {
			const page = asPage(await moduleLesson(seeded, member, slug));
			if (page.locked) throw new Error(`expected ${slug} to be open`);
			expect(page.embedUrl).toContain(EMBED_PREFIX);
		}
		const later = asPage(await moduleLesson(seeded, member, 'added-later'));
		if (later.locked) throw new Error('expected an open page');
		expect(later.embedUrl).toContain(`${EMBED_PREFIX}added-later?`);
		expect(later.siblings.every((sibling) => sibling.lockState === 'open')).toBe(true);

		const standalone = asPage(await video(seeded, member, 'standalone-video'));
		if (standalone.locked) throw new Error('expected an open page');
		expect(standalone.embedUrl).toContain(EMBED_PREFIX);
	});

	it('refuses a suspended member with 403 and the suspension message', async () => {
		const seeded = await seedCatalog(db());
		const member = seeded.users.member.id;
		await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, member));

		expect(await moduleLesson(seeded, member, 'first-lesson')).toBe('error 403');
		expect(await video(seeded, member, 'standalone-video')).toBe('error 403');

		const event = await memberEvent(seeded.services, member, {
			url: '/modules/basics/first-lesson',
			params: { moduleSlug: 'basics', lessonSlug: 'first-lesson' }
		});
		const err = await Promise.resolve(loadModuleLesson(event as unknown as ModuleLessonEvent)).then(
			() => null,
			(e: unknown) => e
		);
		if (!isHttpError(err)) throw new Error('expected an HTTP error');
		expect(err.body.message).toBe(SUSPENDED_MESSAGE);
	});

	it('opens a free preview to an anonymous visitor without its resources', async () => {
		const seeded = await seedCatalog(db());
		await addResource(seeded, seeded.lessons.first);
		await db()
			.update(lessons)
			.set({ is_free_preview: true })
			.where(eq(lessons.id, seeded.lessons.first));

		const page = asPage(await moduleLesson(seeded, null, 'first-lesson'));
		if (page.locked) throw new Error('expected an open page');
		expect(page.embedUrl).toContain(`${EMBED_PREFIX}fixture-video-1?`);
		expect(page.resources).toEqual([]);
		expect(page.canTrackProgress).toBe(false);
		// The other lesson in the module stays locked.
		expect(page.siblings.map((sibling) => sibling.lockState)).toEqual(['open', 'locked']);

		// A signed-in visitor who owns nothing gets no resources either; the owner does.
		const nobody = asPage(await moduleLesson(seeded, seeded.users.nobody.id, 'first-lesson'));
		if (nobody.locked) throw new Error('expected an open page');
		expect(nobody.resources).toEqual([]);
		const owner = asPage(await moduleLesson(seeded, seeded.users.bundleOwner.id, 'first-lesson'));
		if (owner.locked) throw new Error('expected an open page');
		expect(owner.resources).toHaveLength(1);
	});

	it('returns 404 for unpublished and missing lessons', async () => {
		const seeded = await seedCatalog(db());
		await db()
			.update(lessons)
			.set({ is_published: false })
			.where(eq(lessons.id, seeded.lessons.second));
		await db()
			.update(lessons)
			.set({ is_published: false })
			.where(eq(lessons.id, seeded.lessons.standalone));

		const member = seeded.users.member.id;
		expect(await moduleLesson(seeded, member, 'second-lesson')).toBe('error 404');
		expect(await video(seeded, member, 'standalone-video')).toBe('error 404');
		expect(await moduleLesson(seeded, member, 'no-such-lesson')).toBe('error 404');
		expect(await moduleLesson(seeded, member, 'first-lesson', 'no-such-module')).toBe('error 404');
	});
});
