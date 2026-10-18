import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createTestServices } from '../../../../../tests/helpers/services.ts';
import { schema, withTx } from '#lib/server/db/index.ts';
import type { LessonInput, ModuleInput } from '#lib/shared/schemas/content.ts';
import { DomainError } from '../errors.ts';
import { renderMarkdown } from './markdown.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { lessons, lesson_resources, media_assets, product_items, products, user_progress } = schema;

function moduleInput(overrides: Partial<ModuleInput> = {}): ModuleInput {
	return {
		title: 'Basics',
		slug: 'basics',
		description: '',
		thumbnailUrl: '',
		orderIndex: 0,
		isPublished: true,
		isBonus: false,
		isCourseContent: true,
		...overrides
	};
}

function lessonInput(overrides: Partial<LessonInput> = {}): LessonInput {
	return {
		moduleId: null,
		title: 'Pinning',
		slug: 'pinning',
		kind: 'article',
		mediaAssetId: null,
		description: '',
		contentMd: '',
		isFreePreview: false,
		isPublished: false,
		orderIndex: 0,
		...overrides
	};
}

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
	const err = await promise.then(
		() => null,
		(error: unknown) => error
	);
	expect(err).toBeInstanceOf(DomainError);
	expect((err as DomainError).code).toBe(code);
}

describe('createContentService', () => {
	const { db } = useTestDb();
	const setup = () => createTestServices(db());

	let videoSequence = 0;
	async function insertAsset(
		status: 'uploading' | 'processing' | 'ready' | 'failed' = 'ready',
		durationSeconds: number | null = 600
	): Promise<string> {
		videoSequence += 1;
		const [asset] = await db()
			.insert(media_assets)
			.values({
				library_id: '100',
				video_id: `video-${videoSequence}`,
				status,
				duration_seconds: durationSeconds
			})
			.returning();
		return asset.id;
	}

	async function sellLesson(lessonId: string): Promise<void> {
		const [product] = await db()
			.insert(products)
			.values({ slug: `bundle-${lessonId}`, kind: 'bundle', title: 'Bundle', price: 2900 })
			.returning();
		await db().insert(product_items).values({ product_id: product.id, lesson_id: lessonId });
	}

	async function createUser(email = 'member@example.com'): Promise<string> {
		return setup().users.createCredentialUser({ email, password: 'member-password' });
	}

	describe('modules', () => {
		it('creates, lists in order and filters by published state', async () => {
			const { content } = setup();
			const seams = await content.modules.create(
				moduleInput({ title: 'Seams', slug: 'seams', orderIndex: 2, description: 'French seams' })
			);
			await content.modules.create(moduleInput({ title: 'Basics', slug: 'basics', orderIndex: 1 }));
			await content.modules.create(
				moduleInput({ title: 'Draft', slug: 'draft', orderIndex: 0, isPublished: false })
			);

			expect(seams).toMatchObject({
				slug: 'seams',
				description: 'French seams',
				thumbnail_url: null,
				order_index: 2
			});
			expect((await content.modules.list()).map((m) => m.slug)).toEqual([
				'draft',
				'basics',
				'seams'
			]);
			expect((await content.modules.list({ publishedOnly: true })).map((m) => m.slug)).toEqual([
				'basics',
				'seams'
			]);
			expect((await content.modules.getBySlug('draft'))?.title).toBe('Draft');
			expect(await content.modules.getBySlug('draft', { publishedOnly: true })).toBeNull();
		});

		it('keeps module slugs unique on create and update', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			const seams = await content.modules.create(moduleInput({ title: 'Seams', slug: 'seams' }));

			await expectDomainError(content.modules.create(moduleInput()), 'SLUG_TAKEN');
			await expectDomainError(
				content.modules.update(seams.id, moduleInput({ slug: 'basics' })),
				'SLUG_TAKEN'
			);
			const renamed = await content.modules.update(
				basics.id,
				moduleInput({ title: 'The basics', slug: 'basics' })
			);
			expect(renamed.title).toBe('The basics');
			await expectDomainError(
				content.modules.update(crypto.randomUUID(), moduleInput({ slug: 'new' })),
				'MODULE_NOT_FOUND'
			);
		});

		it('reorders modules by position in the id list', async () => {
			const { content } = setup();
			const a = await content.modules.create(moduleInput({ slug: 'a', orderIndex: 0 }));
			const b = await content.modules.create(moduleInput({ slug: 'b', orderIndex: 1 }));
			const c = await content.modules.create(moduleInput({ slug: 'c', orderIndex: 2 }));

			await content.modules.reorder([c.id, a.id, b.id]);

			expect((await content.modules.list()).map((m) => [m.slug, m.order_index])).toEqual([
				['c', 0],
				['a', 1],
				['b', 2]
			]);
			// An unknown id rolls the whole reorder back.
			await expectDomainError(
				content.modules.reorder([a.id, crypto.randomUUID()]),
				'MODULE_NOT_FOUND'
			);
			expect((await content.modules.list()).map((m) => m.slug)).toEqual(['c', 'a', 'b']);
		});

		it('remove refuses with MODULE_HAS_SOLD_LESSONS while a lesson is in a product', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			const sold = await content.lessons.create(lessonInput({ moduleId: basics.id }));
			await sellLesson(sold.id);

			await expectDomainError(content.modules.remove(basics.id), 'MODULE_HAS_SOLD_LESSONS');
			expect(await content.modules.getBySlug('basics')).not.toBeNull();
		});

		it('remove deletes an unsold module together with its lessons', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			await content.lessons.create(lessonInput({ moduleId: basics.id }));

			await content.modules.remove(basics.id);

			expect(await content.modules.getBySlug('basics')).toBeNull();
			expect(await db().select().from(lessons)).toHaveLength(0);
			await expectDomainError(content.modules.remove(basics.id), 'MODULE_NOT_FOUND');
		});
	});

	describe('lesson slugs', () => {
		it('are unique per module and may repeat across modules', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			const seams = await content.modules.create(moduleInput({ slug: 'seams' }));
			await content.lessons.create(lessonInput({ moduleId: basics.id, slug: 'intro' }));

			const other = await content.lessons.create(
				lessonInput({ moduleId: seams.id, slug: 'intro' })
			);
			expect(other.module_id).toBe(seams.id);

			await expectDomainError(
				content.lessons.create(lessonInput({ moduleId: basics.id, slug: 'intro' })),
				'SLUG_TAKEN'
			);
			// Moving a lesson into a module that already has the slug is refused too.
			await expectDomainError(
				content.lessons.update(other.id, lessonInput({ moduleId: basics.id, slug: 'intro' })),
				'SLUG_TAKEN'
			);
			// Saving a lesson under its own slug is not a collision.
			const saved = await content.lessons.update(
				other.id,
				lessonInput({ moduleId: seams.id, slug: 'intro', title: 'Welcome' })
			);
			expect(saved.title).toBe('Welcome');
		});

		it('are unique across all standalone videos, independent of module lessons', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			await content.lessons.create(lessonInput({ moduleId: basics.id, slug: 'bias-binding' }));

			const standalone = await content.lessons.create(lessonInput({ slug: 'bias-binding' }));
			expect(standalone.module_id).toBeNull();

			await expectDomainError(
				content.lessons.create(lessonInput({ slug: 'bias-binding' })),
				'SLUG_TAKEN'
			);
			const moduleLesson = (await content.lessons.listByModule(basics.id))[0];
			await expectDomainError(
				content.lessons.update(
					moduleLesson.id,
					lessonInput({ moduleId: null, slug: 'bias-binding' })
				),
				'SLUG_TAKEN'
			);
		});

		it('refuses unknown modules and media assets', async () => {
			const { content } = setup();

			await expectDomainError(
				content.lessons.create(lessonInput({ moduleId: crypto.randomUUID() })),
				'MODULE_NOT_FOUND'
			);
			await expectDomainError(
				content.lessons.create(lessonInput({ mediaAssetId: crypto.randomUUID() })),
				'MEDIA_NOT_FOUND'
			);
			await expectDomainError(
				content.lessons.update(crypto.randomUUID(), lessonInput()),
				'LESSON_NOT_FOUND'
			);
		});
	});

	describe('content_html', () => {
		it('is rendered and sanitised from content_md on create and recomputed on update', async () => {
			const { content } = setup();
			const markdown =
				'## Pressing\n\nPress **open**.\n\n<script>steal()</script>\n\n<p onclick="x()">tap</p>';

			const created = await content.lessons.create(lessonInput({ contentMd: markdown }));

			expect(created.content_md).toBe(markdown);
			expect(created.content_html).toBe(renderMarkdown(markdown));
			expect(created.content_html).toContain('<h2>Pressing</h2>');
			expect(created.content_html).toContain('<strong>open</strong>');
			expect(created.content_html).not.toContain('script');
			expect(created.content_html).not.toContain('onclick');

			// A stale or tampered content_html is overwritten by the next save.
			await db()
				.update(lessons)
				.set({ content_html: '<script>stale()</script>' })
				.where(eq(lessons.id, created.id));
			const updated = await content.lessons.update(
				created.id,
				lessonInput({ contentMd: 'Now with [a link](https://example.com).' })
			);

			expect(updated.content_html).toBe(
				'<p>Now with <a href="https://example.com">a link</a>.</p>\n'
			);
			const [row] = await db().select().from(lessons).where(eq(lessons.id, created.id));
			expect(row.content_html).toBe(updated.content_html);
		});

		it('is empty for an empty body', async () => {
			const { content } = setup();
			const created = await content.lessons.create(lessonInput({ contentMd: '' }));
			expect(created.content_html).toBe('');
		});
	});

	describe('publishing', () => {
		it('refuses a video lesson whose asset is not ready, then publishes once it is', async () => {
			const { content } = setup();
			const assetId = await insertAsset('processing');
			const lesson = await content.lessons.create(
				lessonInput({ kind: 'video', mediaAssetId: assetId })
			);

			await expectDomainError(content.lessons.publish(lesson.id), 'MEDIA_NOT_READY');
			await db().update(media_assets).set({ status: 'failed' }).where(eq(media_assets.id, assetId));
			await expectDomainError(content.lessons.publish(lesson.id), 'MEDIA_NOT_READY');
			const [stillDraft] = await db().select().from(lessons).where(eq(lessons.id, lesson.id));
			expect(stillDraft.is_published).toBe(false);

			await db().update(media_assets).set({ status: 'ready' }).where(eq(media_assets.id, assetId));
			const published = await content.lessons.publish(lesson.id);
			expect(published.is_published).toBe(true);
		});

		it('refuses a video lesson without any asset', async () => {
			const { content } = setup();
			const lesson = await content.lessons.create(lessonInput({ kind: 'video' }));

			await expectDomainError(content.lessons.publish(lesson.id), 'MEDIA_NOT_READY');
		});

		it('applies the same rule when create or update asks for a published lesson', async () => {
			const { content } = setup();
			const assetId = await insertAsset('uploading');

			await expectDomainError(
				content.lessons.create(
					lessonInput({ kind: 'video', mediaAssetId: assetId, isPublished: true })
				),
				'MEDIA_NOT_READY'
			);
			const draft = await content.lessons.create(
				lessonInput({ kind: 'video', mediaAssetId: assetId })
			);
			await expectDomainError(
				content.lessons.update(
					draft.id,
					lessonInput({ kind: 'video', mediaAssetId: assetId, isPublished: true })
				),
				'MEDIA_NOT_READY'
			);
		});

		it('publishes articles without media and ignores the module state (legacy behaviour)', async () => {
			const { content } = setup();
			const hidden = await content.modules.create(moduleInput({ isPublished: false }));
			const article = await content.lessons.create(lessonInput({ moduleId: hidden.id }));

			const published = await content.lessons.publish(article.id);

			expect(published.is_published).toBe(true);
			await expectDomainError(content.lessons.publish(crypto.randomUUID()), 'LESSON_NOT_FOUND');
		});
	});

	describe('lessons.remove', () => {
		it('refuses with LESSON_IN_PRODUCT while a product lists the lesson', async () => {
			const { content } = setup();
			const lesson = await content.lessons.create(lessonInput());
			await sellLesson(lesson.id);

			await expectDomainError(content.lessons.remove(lesson.id), 'LESSON_IN_PRODUCT');
			expect(await content.lessons.getStandaloneBySlug('pinning')).not.toBeNull();
		});

		it('deletes an unsold lesson', async () => {
			const { content } = setup();
			const lesson = await content.lessons.create(lessonInput());

			await content.lessons.remove(lesson.id);

			expect(await content.lessons.getStandaloneBySlug('pinning')).toBeNull();
			await expectDomainError(content.lessons.remove(lesson.id), 'LESSON_NOT_FOUND');
		});
	});

	describe('lesson reads', () => {
		it('finds lessons by slugs, honouring publishedOnly for module and lesson', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			const hidden = await content.modules.create(
				moduleInput({ slug: 'hidden', isPublished: false })
			);
			await content.lessons.create(lessonInput({ moduleId: basics.id, isPublished: true }));
			await content.lessons.create(lessonInput({ moduleId: basics.id, slug: 'draft' }));
			await content.lessons.create(lessonInput({ moduleId: hidden.id, isPublished: true }));

			const found = await content.lessons.getBySlugs('basics', 'pinning', { publishedOnly: true });
			expect(found?.module.id).toBe(basics.id);
			expect(found?.lesson.slug).toBe('pinning');
			expect(
				await content.lessons.getBySlugs('basics', 'draft', { publishedOnly: true })
			).toBeNull();
			expect((await content.lessons.getBySlugs('basics', 'draft'))?.lesson.slug).toBe('draft');
			expect(
				await content.lessons.getBySlugs('hidden', 'pinning', { publishedOnly: true })
			).toBeNull();
			expect(await content.lessons.getBySlugs('basics', 'missing')).toBeNull();
		});

		it('lists standalone videos and module lessons in order with asset durations', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput());
			const assetId = await insertAsset('ready', 754);
			await content.lessons.create(
				lessonInput({ moduleId: basics.id, slug: 'second', orderIndex: 2 })
			);
			const first = await content.lessons.create(
				lessonInput({ moduleId: basics.id, slug: 'first', orderIndex: 1, mediaAssetId: assetId })
			);
			await content.lessons.create(
				lessonInput({ slug: 'solo-b', orderIndex: 1, isPublished: true })
			);
			await content.lessons.create(lessonInput({ slug: 'solo-a', orderIndex: 0 }));

			expect((await content.lessons.listByModule(basics.id)).map((l) => l.slug)).toEqual([
				'first',
				'second'
			]);
			expect((await content.lessons.listStandalone()).map((l) => l.slug)).toEqual([
				'solo-a',
				'solo-b'
			]);
			expect(
				(await content.lessons.listStandalone({ publishedOnly: true })).map((l) => l.slug)
			).toEqual(['solo-b']);
			expect(
				await content.lessons.getStandaloneBySlug('solo-a', { publishedOnly: true })
			).toBeNull();
			expect(await content.lessons.durationSeconds(first)).toBe(754);
			expect(await content.lessons.durationSeconds({ media_asset_id: null })).toBeNull();
		});
	});

	describe('outline', () => {
		it('computes the course totals from the database', async () => {
			const { content } = setup();
			const basics = await content.modules.create(moduleInput({ slug: 'basics', orderIndex: 1 }));
			const seams = await content.modules.create(
				moduleInput({ title: 'Seams', slug: 'seams', orderIndex: 2 })
			);
			const bonus = await content.modules.create(
				moduleInput({ title: 'Bonus', slug: 'bonus', orderIndex: 3, isBonus: true })
			);
			const draft = await content.modules.create(
				moduleInput({ slug: 'draft', orderIndex: 0, isPublished: false })
			);
			const collection = await content.modules.create(
				moduleInput({ slug: 'collection', isCourseContent: false })
			);
			const video = async (
				moduleId: string | null,
				slug: string,
				seconds: number,
				extra: Partial<LessonInput> = {}
			) =>
				content.lessons.create(
					lessonInput({
						moduleId,
						slug,
						kind: 'video',
						mediaAssetId: await insertAsset('ready', seconds),
						isPublished: true,
						...extra
					})
				);

			const intro = await video(basics.id, 'intro', 330, { orderIndex: 1, isFreePreview: true });
			await video(basics.id, 'tools', 270, { orderIndex: 2 });
			await content.lessons.create(
				lessonInput({ moduleId: basics.id, slug: 'notes', isPublished: true, orderIndex: 3 })
			);
			await video(basics.id, 'unpublished', 900, { isPublished: false });
			await video(seams.id, 'french', 1250);
			await video(bonus.id, 'extra', 600);
			await video(draft.id, 'hidden', 900);
			await video(collection.id, 'collected', 900);
			await video(null, 'standalone', 900);

			const outline = await content.outline();

			expect(outline.totals).toEqual({ modules: 2, bonusModules: 1, videos: 4, minutes: 41 });
			expect(outline.modules.map((m) => [m.slug, m.isBonus, m.lessons.map((l) => l.slug)])).toEqual(
				[
					['basics', false, ['intro', 'tools', 'notes']],
					['seams', false, ['french']],
					['bonus', true, ['extra']]
				]
			);
			expect(outline.modules[0].lessons[0]).toEqual({
				id: intro.id,
				slug: 'intro',
				title: 'Pinning',
				kind: 'video',
				orderIndex: 1,
				isFreePreview: true,
				mediaAssetId: intro.media_asset_id,
				durationSeconds: 330
			});
			expect(outline.modules[0].lessons[2]).toMatchObject({
				kind: 'article',
				mediaAssetId: null,
				durationSeconds: null
			});
		});

		it('is empty when nothing is published', async () => {
			const { content } = setup();
			await content.modules.create(moduleInput({ isPublished: false }));

			expect(await content.outline()).toEqual({
				modules: [],
				totals: { modules: 0, bonusModules: 0, videos: 0, minutes: 0 }
			});
		});
	});

	describe('resources', () => {
		it('adds, lists and removes https resources for a lesson', async () => {
			const { content } = setup();
			const lesson = await content.lessons.create(lessonInput());

			const pattern = await content.resources.add({
				lessonId: lesson.id,
				title: 'Pattern',
				fileUrl: 'https://cdn.example.com/pattern.pdf',
				fileType: 'pdf',
				fileSizeBytes: 2048
			});
			await content.resources.add({
				lessonId: lesson.id,
				title: 'Cutting guide',
				fileUrl: 'https://cdn.example.com/guide.pdf'
			});

			expect((await content.resources.listForLesson(lesson.id)).map((r) => r.title)).toEqual([
				'Pattern',
				'Cutting guide'
			]);
			await content.resources.remove(pattern.id);
			expect(await db().select().from(lesson_resources)).toHaveLength(1);
			await expectDomainError(content.resources.remove(pattern.id), 'RESOURCE_NOT_FOUND');
		});

		it('refuses non-https URLs and unknown lessons', async () => {
			const { content } = setup();
			const lesson = await content.lessons.create(lessonInput());

			await expectDomainError(
				content.resources.add({ lessonId: lesson.id, title: 'x', fileUrl: 'javascript:alert(1)' }),
				'INVALID_URL'
			);
			await expectDomainError(
				content.resources.add({
					lessonId: lesson.id,
					title: 'x',
					fileUrl: 'http://cdn.example.com/a.pdf'
				}),
				'INVALID_URL'
			);
			await expectDomainError(
				content.resources.add({
					lessonId: crypto.randomUUID(),
					title: 'x',
					fileUrl: 'https://cdn.example.com/a.pdf'
				}),
				'LESSON_NOT_FOUND'
			);
		});
	});

	describe('progress', () => {
		it('refuses unpublished and unknown lessons with LESSON_NOT_FOUND', async () => {
			const { content } = setup();
			const userId = await createUser();
			const draft = await content.lessons.create(lessonInput());

			await expectDomainError(
				content.progress.upsert({ userId, lessonId: draft.id, completed: true }),
				'LESSON_NOT_FOUND'
			);
			await expectDomainError(
				content.progress.upsert({ userId, lessonId: crypto.randomUUID(), completed: true }),
				'LESSON_NOT_FOUND'
			);
			expect(await db().select().from(user_progress)).toHaveLength(0);
		});

		it('refuses positions outside 0..86400 seconds and fractional positions', async () => {
			const { content } = setup();
			const userId = await createUser();
			const lesson = await content.lessons.create(lessonInput({ isPublished: true }));

			for (const positionSeconds of [-1, 86_401, 12.5, Number.NaN]) {
				await expectDomainError(
					content.progress.upsert({ userId, lessonId: lesson.id, positionSeconds }),
					'INVALID_POSITION'
				);
			}
			expect(await db().select().from(user_progress)).toHaveLength(0);

			const atLimit = await content.progress.upsert({
				userId,
				lessonId: lesson.id,
				positionSeconds: 86_400
			});
			expect(atLimit.last_position_seconds).toBe(86_400);
			const atStart = await content.progress.upsert({
				userId,
				lessonId: lesson.id,
				positionSeconds: 0
			});
			expect(atStart.last_position_seconds).toBe(0);
		});

		it('upserts one row per user and lesson, changing only the fields given', async () => {
			const { content } = setup();
			const userId = await createUser();
			const lesson = await content.lessons.create(lessonInput({ isPublished: true }));

			const watching = await content.progress.upsert({
				userId,
				lessonId: lesson.id,
				positionSeconds: 95
			});
			expect(watching).toMatchObject({
				completed: false,
				completed_at: null,
				last_position_seconds: 95
			});

			const completed = await content.progress.upsert({
				userId,
				lessonId: lesson.id,
				completed: true
			});
			expect(completed.id).toBe(watching.id);
			expect(completed).toMatchObject({ completed: true, last_position_seconds: 95 });
			expect(completed.completed_at).not.toBeNull();

			const moved = await content.progress.upsert({
				userId,
				lessonId: lesson.id,
				positionSeconds: 120
			});
			expect(moved).toMatchObject({ completed: true, last_position_seconds: 120 });

			const reopened = await content.progress.upsert({
				userId,
				lessonId: lesson.id,
				completed: false
			});
			expect(reopened).toMatchObject({ completed: false, completed_at: null });

			expect(await content.progress.forUser(userId)).toHaveLength(1);
			expect(await content.progress.forUser(await createUser('other@example.com'))).toEqual([]);
		});

		it('summarises progress across the course outline', async () => {
			const { content } = setup();
			const userId = await createUser();
			const basics = await content.modules.create(moduleInput({ orderIndex: 1 }));
			const seams = await content.modules.create(
				moduleInput({ title: 'Seams', slug: 'seams', orderIndex: 2 })
			);
			const video = async (moduleId: string | null, slug: string, seconds: number) =>
				content.lessons.create(
					lessonInput({
						moduleId,
						slug,
						kind: 'video',
						mediaAssetId: await insertAsset('ready', seconds),
						isPublished: true
					})
				);
			const a = await video(basics.id, 'a', 600);
			const b = await video(basics.id, 'b', 300);
			const c = await video(seams.id, 'c', 1200);
			const solo = await video(null, 'solo', 900);

			await content.progress.upsert({ userId, lessonId: a.id, completed: true });
			await content.progress.upsert({ userId, lessonId: b.id, positionSeconds: 150 });
			// A position beyond the video's length counts only up to the length.
			await content.progress.upsert({ userId, lessonId: c.id, positionSeconds: 5000 });
			// Standalone videos are outside the course outline.
			await content.progress.upsert({ userId, lessonId: solo.id, completed: true });

			expect(await content.progress.summary(userId)).toEqual({
				totalLessons: 3,
				completedLessons: 1,
				// 600 + 150 + 1200 seconds = 32.5 minutes, rounded down.
				minutesWatched: 32,
				perModule: [
					{
						moduleId: basics.id,
						slug: 'basics',
						title: 'Basics',
						totalLessons: 2,
						completedLessons: 1
					},
					{
						moduleId: seams.id,
						slug: 'seams',
						title: 'Seams',
						totalLessons: 1,
						completedLessons: 0
					}
				]
			});
		});

		it('lists continue-watching and recently-completed lessons, newest first', async () => {
			const { content } = setup();
			const userId = await createUser();
			const basics = await content.modules.create(moduleInput());
			const assetId = await insertAsset('ready', 480);
			const lesson = (slug: string, moduleId: string | null = basics.id) =>
				content.lessons.create(
					lessonInput({ moduleId, slug, isPublished: true, mediaAssetId: assetId })
				);
			const older = await lesson('older');
			const newer = await lesson('newer');
			const solo = await lesson('solo', null);
			const notStarted = await lesson('not-started');
			const done1 = await lesson('done-1');
			const done2 = await lesson('done-2');

			await content.progress.upsert({ userId, lessonId: older.id, positionSeconds: 30 });
			await content.progress.upsert({ userId, lessonId: newer.id, positionSeconds: 60 });
			await content.progress.upsert({ userId, lessonId: solo.id, positionSeconds: 90 });
			await content.progress.upsert({ userId, lessonId: notStarted.id, positionSeconds: 0 });
			await content.progress.upsert({ userId, lessonId: done1.id, completed: true });
			await content.progress.upsert({ userId, lessonId: done2.id, completed: true });
			// The legacy `update_user_progress_updated_at` trigger resets `updated_at` to
			// now() on every UPDATE, so the fixture time only sticks with triggers off.
			const setTimes = (lessonId: string, minutesAgo: number) =>
				withTx(db(), async (tx) => {
					await tx.execute(sql`set local session_replication_role = replica`);
					await tx
						.update(user_progress)
						.set({
							updated_at: sql`now() - make_interval(mins => ${minutesAgo})`,
							completed_at: sql`case when ${user_progress.completed} then now() - make_interval(mins => ${minutesAgo}) end`
						})
						.where(eq(user_progress.lesson_id, lessonId));
				});
			await setTimes(older.id, 30);
			await setTimes(newer.id, 20);
			await setTimes(solo.id, 10);
			await setTimes(done1.id, 5);
			await setTimes(done2.id, 50);

			const watching = await content.progress.continueWatching(userId, 2);
			expect(watching.map((p) => [p.lessonSlug, p.moduleSlug, p.positionSeconds])).toEqual([
				['solo', null, 90],
				['newer', 'basics', 60]
			]);
			expect(watching[1]).toMatchObject({
				lessonId: newer.id,
				lessonTitle: 'Pinning',
				moduleTitle: 'Basics',
				durationSeconds: 480,
				completedAt: null
			});
			expect(
				(await content.progress.continueWatching(userId, 10)).map((p) => p.lessonSlug)
			).toEqual(['solo', 'newer', 'older']);

			const completed = await content.progress.recentlyCompleted(userId, 5);
			expect(completed.map((p) => p.lessonSlug)).toEqual(['done-1', 'done-2']);
			expect(completed[0].completedAt).not.toBeNull();

			// Unpublishing a lesson hides it from both lists.
			await db().update(lessons).set({ is_published: false }).where(eq(lessons.id, solo.id));
			expect(
				(await content.progress.continueWatching(userId, 10)).map((p) => p.lessonSlug)
			).toEqual(['newer', 'older']);
		});
	});

	describe('freePreviewLesson', () => {
		it('returns null when no published free preview exists', async () => {
			const { content } = setup();
			await content.lessons.create(lessonInput({ isFreePreview: true }));

			expect(await content.freePreviewLesson()).toBeNull();
		});

		it('picks the first published free preview by module, then lesson order', async () => {
			const { content } = setup();
			const assetId = await insertAsset('ready', 200);
			const later = await content.modules.create(moduleInput({ slug: 'later', orderIndex: 5 }));
			const first = await content.modules.create(moduleInput({ slug: 'first', orderIndex: 1 }));
			const hidden = await content.modules.create(
				moduleInput({ slug: 'hidden', orderIndex: 0, isPublished: false })
			);
			const preview = (moduleId: string | null, slug: string, orderIndex: number) =>
				content.lessons.create(
					lessonInput({
						moduleId,
						slug,
						orderIndex,
						isFreePreview: true,
						isPublished: true,
						kind: 'video',
						mediaAssetId: assetId
					})
				);
			await preview(null, 'standalone', 0);
			await preview(hidden.id, 'in-hidden-module', 0);
			await preview(later.id, 'in-later-module', 0);
			await preview(first.id, 'second-in-first', 2);
			const expected = await preview(first.id, 'first-in-first', 1);
			await content.lessons.create(
				lessonInput({ moduleId: first.id, slug: 'not-preview', orderIndex: 0, isPublished: true })
			);

			const found = await content.freePreviewLesson();

			expect(found?.lesson.id).toBe(expected.id);
			expect(found?.module?.slug).toBe('first');
			expect(found?.asset).toMatchObject({ id: assetId, video_id: expect.any(String) });

			// Standalone previews come after every module's.
			await db().delete(lessons).where(eq(lessons.module_id, first.id));
			await db().delete(lessons).where(eq(lessons.module_id, later.id));
			const standalone = await content.freePreviewLesson();
			expect(standalone?.lesson.slug).toBe('standalone');
			expect(standalone?.module).toBeNull();
		});
	});
});
