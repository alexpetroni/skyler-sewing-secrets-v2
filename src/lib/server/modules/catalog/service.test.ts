import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createTestServices } from '../../../../../tests/helpers/services.ts';
import { schema } from '#lib/server/db/index.ts';
import type { ProductInput } from '#lib/shared/schemas/catalog.ts';
import { DomainError } from '../errors.ts';
import { PUBLISH_CONDITIONS, PublishBlockedError } from './service.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, entitlements, media_assets, orders, order_items, product_items, products } =
	schema;

let slugSequence = 0;
function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
	slugSequence += 1;
	return {
		kind: 'bundle',
		slug: `product-${slugSequence}`,
		title: 'Zippers Pack',
		tagline: '',
		descriptionMd: 'Every zipper **technique**',
		coverImageUrl: 'https://cdn.example.com/zippers.jpg',
		price: 2900,
		salePrice: null,
		saleStartsAt: null,
		saleEndsAt: null,
		isFeatured: false,
		sortOrder: 0,
		...overrides
	};
}

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<unknown> {
	const err = await promise.then(
		() => null,
		(error: unknown) => error
	);
	expect(err).toBeInstanceOf(DomainError);
	expect((err as DomainError).code).toBe(code);
	return err;
}

describe('createCatalogService', () => {
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

	let lessonSequence = 0;
	/** A published video lesson with a ready asset by default; `moduleId` null = standalone. */
	async function createLesson(
		overrides: {
			moduleId?: string | null;
			isPublished?: boolean;
			isFreePreview?: boolean;
			mediaStatus?: 'uploading' | 'processing' | 'ready' | 'failed';
			durationSeconds?: number;
			kind?: 'video' | 'article';
		} = {}
	): Promise<string> {
		lessonSequence += 1;
		const { content } = setup();
		const kind = overrides.kind ?? 'video';
		const lesson = await content.lessons.create({
			moduleId: overrides.moduleId ?? null,
			title: `Lesson ${lessonSequence}`,
			slug: `lesson-${lessonSequence}`,
			kind,
			mediaAssetId:
				kind === 'video'
					? await insertAsset(overrides.mediaStatus ?? 'ready', overrides.durationSeconds ?? 600)
					: null,
			description: '',
			contentMd: kind === 'article' ? 'Some text' : '',
			isFreePreview: overrides.isFreePreview ?? false,
			isPublished: overrides.isPublished ?? true,
			orderIndex: lessonSequence
		});
		return lesson.id;
	}

	async function createUser(email = 'member@example.com'): Promise<string> {
		return setup().users.createCredentialUser({ email, password: 'member-password' });
	}

	describe('flagship', () => {
		it('throws NO_FLAGSHIP until a course exists, then returns the all-access product', async () => {
			const { catalog } = setup();
			await expectDomainError(catalog.flagship(), 'NO_FLAGSHIP');

			const course = await catalog.create(
				productInput({ kind: 'course', slug: 'the-course', price: 14900 })
			);
			expect(course).toMatchObject({ kind: 'course', access_scope: 'all', slug: 'the-course' });
			expect((await catalog.flagship()).id).toBe(course.id);
		});

		it('refuses a second course and keeps bundles and singles on access_scope items', async () => {
			const { catalog } = setup();
			await catalog.create(productInput({ kind: 'course' }));

			await expectDomainError(catalog.create(productInput({ kind: 'course' })), 'FLAGSHIP_EXISTS');
			expect(await db().select().from(products)).toHaveLength(1);

			const bundle = await catalog.create(productInput({ kind: 'bundle' }));
			const single = await catalog.create(productInput({ kind: 'single' }));
			expect(bundle.access_scope).toBe('items');
			expect(single.access_scope).toBe('items');
		});
	});

	describe('create and update', () => {
		it('renders the description, nulls empty optionals and refuses a taken slug', async () => {
			const { catalog } = setup();
			const product = await catalog.create(productInput({ slug: 'zippers', tagline: '' }));
			expect(product).toMatchObject({
				description_md: 'Every zipper **technique**',
				description_html: '<p>Every zipper <strong>technique</strong></p>\n',
				tagline: null,
				price: 2900,
				is_published: false
			});

			await expectDomainError(catalog.create(productInput({ slug: 'zippers' })), 'SLUG_TAKEN');

			const updated = await catalog.update(
				product.id,
				productInput({
					kind: 'single',
					slug: 'zippers',
					title: 'Zippers Pack 2',
					descriptionMd: '',
					salePrice: 1900,
					saleStartsAt: '2026-01-01T00:00:00.000Z'
				})
			);
			// The kind is fixed at creation; the rest is replaced.
			expect(updated).toMatchObject({
				kind: 'bundle',
				title: 'Zippers Pack 2',
				description_md: null,
				description_html: null,
				sale_price: 1900
			});
			expect(Date.parse(updated.sale_starts_at ?? '')).toBe(Date.parse('2026-01-01T00:00:00Z'));

			await expectDomainError(
				catalog.update(crypto.randomUUID(), productInput()),
				'PRODUCT_NOT_FOUND'
			);
		});
	});

	describe('setItems', () => {
		it('a course has no item list', async () => {
			const { catalog } = setup();
			const course = await catalog.create(productInput({ kind: 'course' }));
			const lesson = await createLesson();

			await expectDomainError(catalog.setItems(course.id, [lesson]), 'INVALID_ITEMS');
			expect(await catalog.setItems(course.id, [])).toEqual([]);
		});

		it('a single sells exactly one lesson', async () => {
			const { catalog } = setup();
			const single = await catalog.create(productInput({ kind: 'single' }));
			const [a, b] = [await createLesson(), await createLesson()];

			await expectDomainError(catalog.setItems(single.id, []), 'INVALID_ITEMS');
			await expectDomainError(catalog.setItems(single.id, [a, b]), 'INVALID_ITEMS');
			const items = await catalog.setItems(single.id, [a, a]);
			expect(items.map((item) => item.lesson_id)).toEqual([a]);
		});

		it('a bundle dedupes, keeps the given order and replaces the previous list', async () => {
			const { catalog } = setup();
			const bundle = await catalog.create(productInput({ kind: 'bundle' }));
			const [a, b, c] = [await createLesson(), await createLesson(), await createLesson()];

			const first = await catalog.setItems(bundle.id, [c, a, c, b]);
			expect(first.map((item) => [item.lesson_id, item.sort_order])).toEqual([
				[c, 0],
				[a, 1],
				[b, 2]
			]);

			const second = await catalog.setItems(bundle.id, [b]);
			expect(second.map((item) => item.lesson_id)).toEqual([b]);
			expect((await catalog.getById(bundle.id))?.items.map((item) => item.lesson_id)).toEqual([b]);
		});

		it('refuses an id that is not a lesson', async () => {
			const { catalog } = setup();
			const bundle = await catalog.create(productInput({ kind: 'bundle' }));
			const a = await createLesson();

			await expectDomainError(
				catalog.setItems(bundle.id, [a, crypto.randomUUID()]),
				'LESSON_NOT_FOUND'
			);
			expect(await db().select().from(product_items)).toEqual([]);
		});
	});

	describe('publishChecklist and publish', () => {
		it('lists every unmet condition for a bare bundle with an unready, unpublished item', async () => {
			const { catalog } = setup();
			const bundle = await catalog.create(
				productInput({ kind: 'bundle', coverImageUrl: '', descriptionMd: '' })
			);
			// The schema floors the price at 30p; the checklist must still report it.
			await db().update(products).set({ price: 10 }).where(eq(products.id, bundle.id));
			const draft = await createLesson({ isPublished: false, mediaStatus: 'processing' });
			await catalog.setItems(bundle.id, [draft]);

			const unmet = await catalog.publishChecklist(bundle.id);
			expect(unmet).toEqual([
				'cover',
				'description',
				'price',
				'items',
				'lessons_published',
				'media_ready'
			]);
			expect(unmet).toEqual([...PUBLISH_CONDITIONS]);

			const err = await expectDomainError(catalog.publish(bundle.id), 'PUBLISH_BLOCKED');
			expect(err).toBeInstanceOf(PublishBlockedError);
			expect((err as PublishBlockedError).unmet).toEqual(unmet);
			expect((await catalog.getById(bundle.id))?.is_published).toBe(false);
		});

		it('reports items for a single without exactly one lesson and ignores items for the course', async () => {
			const { catalog } = setup();
			const single = await catalog.create(productInput({ kind: 'single' }));
			expect(await catalog.publishChecklist(single.id)).toEqual(['items']);

			const course = await catalog.create(productInput({ kind: 'course' }));
			expect(await catalog.publishChecklist(course.id)).toEqual([]);
		});

		it('publishes once every condition is met and unpublishes again', async () => {
			const { catalog } = setup();
			const bundle = await catalog.create(productInput({ kind: 'bundle' }));
			const article = await createLesson({ kind: 'article' });
			await catalog.setItems(bundle.id, [await createLesson(), article]);

			expect(await catalog.publishChecklist(bundle.id)).toEqual([]);
			expect((await catalog.publish(bundle.id)).is_published).toBe(true);
			expect((await catalog.listPublished()).map((p) => p.id)).toEqual([bundle.id]);

			expect((await catalog.unpublish(bundle.id)).is_published).toBe(false);
			expect(await catalog.listPublished()).toEqual([]);
		});
	});

	describe('catalogue reads', () => {
		it('orders featured first, prices with the sale and counts items and duration', async () => {
			const { catalog } = setup();
			const now = new Date('2026-06-15T12:00:00Z');
			const [a, b] = [
				await createLesson({ durationSeconds: 600 }),
				await createLesson({ durationSeconds: 300 })
			];
			const bundle = await catalog.create(
				productInput({
					kind: 'bundle',
					slug: 'bundle',
					title: 'Bundle',
					price: 2900,
					salePrice: 1900,
					saleStartsAt: '2026-06-01T00:00:00Z',
					saleEndsAt: '2026-07-01T00:00:00Z',
					sortOrder: 1
				})
			);
			await catalog.setItems(bundle.id, [a, b]);
			const single = await catalog.create(
				productInput({ kind: 'single', slug: 'single', title: 'Single', price: 900, sortOrder: 0 })
			);
			await catalog.setItems(single.id, [a]);
			const course = await catalog.create(
				productInput({
					kind: 'course',
					slug: 'course',
					title: 'Course',
					price: 14900,
					isFeatured: true,
					sortOrder: 9
				})
			);
			await catalog.create(productInput({ kind: 'bundle', slug: 'draft' }));
			for (const id of [bundle.id, single.id, course.id]) await catalog.publish(id);

			const listed = await catalog.listPublished({ now });
			expect(listed.map((p) => p.slug)).toEqual(['course', 'single', 'bundle']);
			expect(listed[2]).toMatchObject({
				pricing: { listPrice: 2900, price: 1900, onSale: true },
				itemCount: 2,
				durationSeconds: 900
			});
			expect(listed[1]).toMatchObject({
				pricing: { listPrice: 900, price: 900, onSale: false },
				itemCount: 1,
				durationSeconds: 600
			});
			// Standalone lessons are not course content: the flagship counts the outline.
			expect(listed[0]).toMatchObject({ itemCount: 0, durationSeconds: 0 });

			expect((await catalog.listPublished({ kind: 'single', now })).map((p) => p.slug)).toEqual([
				'single'
			]);
			expect((await catalog.listAll()).map((p) => p.slug)).toEqual([
				'course',
				'single',
				'draft',
				'bundle'
			]);
		});

		it('getPublishedBySlug returns the lessons in item order and hides drafts', async () => {
			const { catalog, content } = setup();
			const module = await content.modules.create({
				title: 'Basics',
				slug: 'basics',
				description: '',
				thumbnailUrl: '',
				orderIndex: 0,
				isPublished: true,
				isBonus: false,
				isCourseContent: true
			});
			const inModule = await createLesson({ moduleId: module.id, isFreePreview: true });
			const standalone = await createLesson({ durationSeconds: 120 });
			const bundle = await catalog.create(productInput({ kind: 'bundle', slug: 'pack' }));
			await catalog.setItems(bundle.id, [standalone, inModule]);

			expect(await catalog.getPublishedBySlug('pack')).toBeNull();
			await catalog.publish(bundle.id);

			const detail = await catalog.getPublishedBySlug('pack');
			expect(detail?.lessons).toEqual([
				expect.objectContaining({
					id: standalone,
					moduleId: null,
					moduleSlug: null,
					durationSeconds: 120,
					isFreePreview: false
				}),
				expect.objectContaining({
					id: inModule,
					moduleSlug: 'basics',
					moduleTitle: 'Basics',
					isFreePreview: true
				})
			]);
			expect(detail).toMatchObject({ itemCount: 2, durationSeconds: 720 });

			const course = await catalog.create(productInput({ kind: 'course', slug: 'course' }));
			await catalog.publish(course.id);
			const courseDetail = await catalog.getPublishedBySlug('course');
			expect(courseDetail?.lessons.map((lesson) => lesson.id)).toEqual([inModule]);
			expect(courseDetail).toMatchObject({ itemCount: 1, durationSeconds: 600 });
		});
	});

	describe('lesson lookups', () => {
		it("productLessons lists an unpublished product's lessons in item order, drafts included", async () => {
			const { catalog } = setup();
			const first = await createLesson();
			const draft = await createLesson({ isPublished: false });
			const bundle = await catalog.create(productInput({ kind: 'bundle', slug: 'owned-pack' }));
			await catalog.setItems(bundle.id, [draft, first]);

			const items = await catalog.productLessons(bundle.id);
			expect(items.map((lesson) => [lesson.id, lesson.isPublished])).toEqual([
				[draft, false],
				[first, true]
			]);
			await expect(catalog.productLessons(crypto.randomUUID())).rejects.toMatchObject({
				code: 'PRODUCT_NOT_FOUND'
			});
		});

		it('productsContainingLesson filters by published state', async () => {
			const { catalog } = setup();
			const lesson = await createLesson();
			const live = await catalog.create(productInput({ kind: 'bundle', title: 'Live' }));
			const draft = await catalog.create(productInput({ kind: 'bundle', title: 'Draft' }));
			await catalog.setItems(live.id, [lesson, await createLesson()]);
			await catalog.setItems(draft.id, [lesson, await createLesson()]);
			await catalog.publish(live.id);

			expect((await catalog.productsContainingLesson(lesson)).map((p) => p.title)).toEqual([
				'Draft',
				'Live'
			]);
			expect(
				(await catalog.productsContainingLesson(lesson, { publishedOnly: true })).map(
					(p) => p.title
				)
			).toEqual(['Live']);
		});

		it('cheapestProductForLesson picks the cheaper bundle by effective price, then the flagship', async () => {
			const { catalog } = setup();
			const now = new Date('2026-06-15T12:00:00Z');
			const lesson = await createLesson();
			const other = await createLesson();

			const dear = await catalog.create(
				productInput({ kind: 'bundle', title: 'Dear', price: 4900, salePrice: 1500 })
			);
			const cheap = await catalog.create(
				productInput({ kind: 'bundle', title: 'Cheap', price: 2900 })
			);
			const unpublished = await catalog.create(
				productInput({ kind: 'bundle', title: 'Unpublished', price: 500 })
			);
			for (const product of [dear, cheap, unpublished]) {
				await catalog.setItems(product.id, [lesson, other]);
			}
			await catalog.publish(dear.id);
			await catalog.publish(cheap.id);

			// The sale makes the dearer list price the cheaper offer today.
			const offer = await catalog.cheapestProductForLesson(lesson, now);
			expect(offer?.product.title).toBe('Dear');
			expect(offer?.pricing.price).toBe(1500);

			await catalog.unpublish(dear.id);
			expect((await catalog.cheapestProductForLesson(lesson, now))?.product.title).toBe('Cheap');

			// Nothing lists `other` once the bundles are gone: fall back to the flagship.
			await catalog.unpublish(cheap.id);
			expect(await catalog.cheapestProductForLesson(other, now)).toBeNull();
			const course = await catalog.create(productInput({ kind: 'course', price: 14900 }));
			expect(await catalog.cheapestProductForLesson(other, now)).toBeNull();
			await catalog.publish(course.id);
			const fallback = await catalog.cheapestProductForLesson(other, now);
			expect(fallback?.product.id).toBe(course.id);
			expect(fallback?.pricing.price).toBe(14900);
		});
	});

	describe('remove', () => {
		it('deletes a product nobody bought, with its items', async () => {
			const { catalog } = setup();
			const bundle = await catalog.create(productInput({ kind: 'bundle' }));
			await catalog.setItems(bundle.id, [await createLesson()]);

			await catalog.remove(bundle.id);
			expect(await catalog.getById(bundle.id)).toBeNull();
			expect(await db().select().from(product_items)).toEqual([]);
			await expectDomainError(catalog.remove(bundle.id), 'PRODUCT_NOT_FOUND');
		});

		it('refuses with PRODUCT_HAS_HISTORY when an order item or an entitlement references it', async () => {
			const { catalog } = setup();
			const userId = await createUser();
			const sold = await catalog.create(productInput({ kind: 'bundle', title: 'Sold' }));
			const granted = await catalog.create(productInput({ kind: 'bundle', title: 'Granted' }));

			const [order] = await db()
				.insert(orders)
				.values({ user_id: userId, status: 'paid', subtotal: 2900, total: 2900 })
				.returning();
			await db().insert(order_items).values({
				order_id: order.id,
				product_id: sold.id,
				product_title: 'Sold',
				list_price: 2900,
				unit_price: 2900
			});
			await db()
				.insert(entitlements)
				.values({ user_id: userId, product_id: granted.id, source: 'admin_grant' });

			await expectDomainError(catalog.remove(sold.id), 'PRODUCT_HAS_HISTORY');
			await expectDomainError(catalog.remove(granted.id), 'PRODUCT_HAS_HISTORY');
			expect(await db().select().from(products)).toHaveLength(2);
		});
	});

	describe('audit log', () => {
		it('records every write with the actor, and nothing without one', async () => {
			const { catalog } = setup();
			const adminId = await createUser('admin@example.com');
			const lesson = await createLesson();

			const bundle = await catalog.create(productInput({ kind: 'bundle' }), adminId);
			await catalog.update(bundle.id, productInput({ kind: 'bundle', title: 'Renamed' }), adminId);
			await catalog.setItems(bundle.id, [lesson, await createLesson()], adminId);
			await catalog.publish(bundle.id, adminId);
			await catalog.unpublish(bundle.id, adminId);
			await catalog.remove(bundle.id, adminId);

			const entries = await db().select().from(audit_log).orderBy(audit_log.created_at);
			expect(entries.map((entry) => entry.action)).toEqual([
				'product.create',
				'product.update',
				'product.set_items',
				'product.publish',
				'product.unpublish',
				'product.delete'
			]);
			expect(entries.every((entry) => entry.actor_id === adminId)).toBe(true);
			expect(
				entries.every((entry) => entry.entity === 'product' && entry.entity_id === bundle.id)
			).toBe(true);
			expect(entries[1].before).toMatchObject({ title: 'Zippers Pack' });
			expect(entries[1].after).toMatchObject({ title: 'Renamed' });
			expect(entries[2].after).toEqual({ lessonIds: expect.arrayContaining([lesson]) });
			expect(entries[3]).toMatchObject({
				before: { is_published: false },
				after: { is_published: true }
			});

			const silent = await catalog.create(productInput({ kind: 'single' }));
			await catalog.setItems(silent.id, [lesson]);
			await catalog.publish(silent.id);
			expect(await db().select().from(audit_log)).toHaveLength(6);
		});

		it('rolls the audit entry back with a refused write', async () => {
			const { catalog } = setup();
			const adminId = await createUser('admin@example.com');
			const single = await catalog.create(productInput({ kind: 'single' }), adminId);

			await expectDomainError(catalog.publish(single.id, adminId), 'PUBLISH_BLOCKED');
			expect((await db().select().from(audit_log)).map((entry) => entry.action)).toEqual([
				'product.create'
			]);
		});
	});
});
