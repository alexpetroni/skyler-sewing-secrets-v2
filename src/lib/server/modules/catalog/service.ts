import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type { Logger, Revalidator } from '#lib/server/platform/index.ts';
import {
	LESSON_SEARCH_LIMIT,
	PRICE_MIN,
	type ProductFields,
	type ProductInput,
	type ProductKind,
	type ProductVisibilityInput
} from '#lib/shared/schemas/catalog.ts';
import { renderMarkdown, type ContentService } from '../content/index.ts';
import { DomainError } from '../errors.ts';
import { effectivePrice, type EffectivePrice } from './pricing.ts';

const {
	products,
	product_items,
	lessons,
	modules,
	media_assets,
	order_items,
	entitlements,
	audit_log
} = schema;

export type Product = typeof products.$inferSelect;
export type ProductItem = typeof product_items.$inferSelect;

/** The conditions `publishChecklist` reports when unmet. */
export type PublishCondition =
	'cover' | 'description' | 'price' | 'items' | 'lessons_published' | 'media_ready';

export const PUBLISH_CONDITIONS: readonly PublishCondition[] = [
	'cover',
	'description',
	'price',
	'items',
	'lessons_published',
	'media_ready'
];

/** What the admin must do for each unmet condition. */
export const PUBLISH_CONDITION_LABELS: Record<PublishCondition, string> = {
	cover: 'Add a cover image',
	description: 'Write a description',
	price: 'Set a price of at least £0.30',
	items: 'Add the videos it sells (a bundle needs two or more, a single exactly one)',
	lessons_published: 'Publish every included lesson',
	media_ready: 'Wait until every included video has finished processing'
};

/** The form error a refused publish shows. */
export function publishBlockedMessage(unmet: readonly PublishCondition[]): string {
	return `Not published yet: ${unmet.map((condition) => PUBLISH_CONDITION_LABELS[condition]).join('; ')}.`;
}

/** Thrown by `publish` while the checklist has unmet conditions. */
export class PublishBlockedError extends DomainError {
	readonly unmet: PublishCondition[];
	constructor(unmet: PublishCondition[]) {
		super('PUBLISH_BLOCKED', publishBlockedMessage(unmet));
		this.name = 'PublishBlockedError';
		this.unmet = unmet;
	}
}

/** A product as the catalogue shows it. */
export interface CatalogProduct extends Product {
	pricing: EffectivePrice;
	/** Lessons the product unlocks; for the flagship, the published course outline. */
	itemCount: number;
	durationSeconds: number;
}

export interface ProductLesson {
	id: string;
	slug: string;
	title: string;
	kind: 'video' | 'article';
	moduleId: string | null;
	moduleSlug: string | null;
	moduleTitle: string | null;
	durationSeconds: number | null;
	isFreePreview: boolean;
	isPublished: boolean;
}

export interface ProductDetail extends CatalogProduct {
	lessons: ProductLesson[];
}

/** A product that unlocks a lesson, with its price now. */
export interface LessonOffer {
	product: Product;
	pricing: EffectivePrice;
}

/** A lesson as the admin item picker shows it, with the products that already list it. */
export interface PickerLesson {
	id: string;
	title: string;
	moduleTitle: string | null;
	durationSeconds: number | null;
	isPublished: boolean;
	products: Array<{ id: string; title: string }>;
}

export interface ListPublishedParams {
	kind?: ProductKind;
	now?: Date;
}

export interface CatalogService {
	/** The single `access_scope = 'all'` product; throws `NO_FLAGSHIP` when absent. */
	flagship(): Promise<Product>;
	/** Published products ordered `is_featured desc, sort_order, title`. */
	listPublished(params?: ListPublishedParams): Promise<CatalogProduct[]>;
	getPublishedBySlug(slug: string, now?: Date): Promise<ProductDetail | null>;
	listAll(): Promise<Product[]>;
	getById(id: string): Promise<(Product & { items: ProductItem[] }) | null>;
	/**
	 * A `course` becomes the flagship (`access_scope = 'all'`); refused while one exists.
	 * `lessonIds` become the items in the same transaction, under the `setItems` rules.
	 */
	create(input: ProductInput, actorId?: string, lessonIds?: string[]): Promise<Product>;
	/** `input.kind` is ignored: the kind is fixed at creation. */
	update(id: string, input: ProductInput, actorId?: string): Promise<Product>;
	/** `update` with only the given fields changed; the rest keep their saved values. */
	updateFields(id: string, fields: ProductFields, actorId?: string): Promise<Product>;
	/**
	 * Featured flag, sort order and published state in one write; publishing
	 * refuses with `PublishBlockedError` (nothing saved) while the checklist is not empty.
	 */
	setVisibility(id: string, input: ProductVisibilityInput, actorId?: string): Promise<Product>;
	/** Replaces the items, deduped, in the given order. `single` → exactly one; `course` → none. */
	setItems(id: string, lessonIds: string[], actorId?: string): Promise<ProductItem[]>;
	publishChecklist(id: string): Promise<PublishCondition[]>;
	/** Refuses with `PublishBlockedError` while the checklist is not empty. */
	publish(id: string, actorId?: string): Promise<Product>;
	unpublish(id: string, actorId?: string): Promise<Product>;
	/** Refuses with `PRODUCT_HAS_HISTORY` while orders or entitlements reference the product. */
	remove(id: string, actorId?: string): Promise<void>;
	/** The lessons a product unlocks, published or not; the outline for the flagship. */
	productLessons(id: string): Promise<ProductLesson[]>;
	productsContainingLesson(
		lessonId: string,
		params?: { publishedOnly?: boolean }
	): Promise<Product[]>;
	/** The cheapest published product listing the lesson, else the published flagship, else null. */
	cheapestProductForLesson(lessonId: string, now?: Date): Promise<LessonOffer | null>;
	/** Every product with its price now and item totals, in catalogue order. */
	listAllWithTotals(now?: Date): Promise<CatalogProduct[]>;
	/** Lessons whose title or module title contains `q`, at most `LESSON_SEARCH_LIMIT`. */
	searchLessons(q: string): Promise<PickerLesson[]>;
	/** The given lessons in the given order; unknown ids are left out. */
	pickerLessons(ids: readonly string[]): Promise<PickerLesson[]>;
}

export interface CreateCatalogServiceDeps {
	db: Db;
	content: ContentService;
	log: Logger;
	/** Refreshes `/catalogue` and the product page after a visibility change. */
	revalidator?: Revalidator;
}

const CATALOGUE_ORDER = [desc(products.is_featured), asc(products.sort_order), asc(products.title)];

/** A saved product as the input `update` takes. */
function inputOf(product: Product): ProductInput {
	return {
		kind: product.kind,
		slug: product.slug,
		title: product.title,
		tagline: product.tagline ?? '',
		descriptionMd: product.description_md ?? '',
		coverImageUrl: product.cover_image_url ?? '',
		price: product.price,
		salePrice: product.sale_price,
		saleStartsAt: product.sale_starts_at,
		saleEndsAt: product.sale_ends_at,
		isFeatured: product.is_featured,
		sortOrder: product.sort_order
	};
}

/** Escapes `%`, `_` and `\` so a search term matches literally inside `ilike`. */
function likePattern(q: string): string {
	return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function productValues(input: ProductInput) {
	return {
		slug: input.slug,
		title: input.title,
		tagline: input.tagline || null,
		description_md: input.descriptionMd || null,
		// Always recomputed: `description_html` is never accepted from a caller.
		description_html: input.descriptionMd ? renderMarkdown(input.descriptionMd) : null,
		cover_image_url: input.coverImageUrl || null,
		price: input.price,
		sale_price: input.salePrice,
		sale_starts_at: input.saleStartsAt,
		sale_ends_at: input.saleEndsAt,
		is_featured: input.isFeatured,
		sort_order: input.sortOrder
	};
}

interface ItemRow {
	lessonId: string;
	kind: 'video' | 'article';
	isPublished: boolean;
	mediaStatus: string | null;
}

export function createCatalogService({
	db,
	content,
	log,
	revalidator
}: CreateCatalogServiceDeps): CatalogService {
	async function writeAudit(
		tx: Tx,
		actorId: string | undefined,
		action: string,
		productId: string,
		before: unknown,
		after: unknown
	): Promise<void> {
		if (!actorId) return;
		await tx.insert(audit_log).values({
			actor_id: actorId,
			action,
			entity: 'product',
			entity_id: productId,
			before,
			after
		});
	}

	async function requireProduct(executor: Db | Tx, id: string): Promise<Product> {
		const [product] = await executor.select().from(products).where(eq(products.id, id)).limit(1);
		if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found');
		return product;
	}

	async function findFlagship(executor: Db | Tx): Promise<Product | null> {
		const [product] = await executor
			.select()
			.from(products)
			.where(eq(products.access_scope, 'all'))
			.limit(1);
		return product ?? null;
	}

	async function assertSlugFree(tx: Tx, slug: string, exceptId?: string): Promise<void> {
		const filters: SQL[] = [eq(products.slug, slug)];
		if (exceptId) filters.push(ne(products.id, exceptId));
		const [taken] = await tx
			.select({ id: products.id })
			.from(products)
			.where(and(...filters))
			.limit(1);
		if (taken) throw new DomainError('SLUG_TAKEN', 'This slug is already in use');
	}

	/** The items of a product joined to lesson and media state, in item order. */
	async function itemRows(executor: Db | Tx, productId: string): Promise<ItemRow[]> {
		return executor
			.select({
				lessonId: product_items.lesson_id,
				kind: lessons.kind,
				isPublished: lessons.is_published,
				mediaStatus: media_assets.status
			})
			.from(product_items)
			.innerJoin(lessons, eq(lessons.id, product_items.lesson_id))
			.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
			.where(eq(product_items.product_id, productId))
			.orderBy(asc(product_items.sort_order));
	}

	function checklistFor(product: Product, items: ItemRow[]): PublishCondition[] {
		const unmet: PublishCondition[] = [];
		if (!product.cover_image_url) unmet.push('cover');
		if (!product.description_md?.trim()) unmet.push('description');
		if (product.price < PRICE_MIN) unmet.push('price');
		if (
			(product.kind === 'bundle' && items.length < 2) ||
			(product.kind === 'single' && items.length !== 1)
		) {
			unmet.push('items');
		}
		if (items.some((item) => !item.isPublished)) unmet.push('lessons_published');
		if (items.some((item) => item.kind === 'video' && item.mediaStatus !== 'ready')) {
			unmet.push('media_ready');
		}
		return unmet;
	}

	/** Item count and total duration per product id, from `product_items`. */
	async function itemTotals(
		productIds: string[]
	): Promise<Map<string, { count: number; seconds: number }>> {
		const totals = new Map<string, { count: number; seconds: number }>();
		if (productIds.length === 0) return totals;
		const rows = await db
			.select({
				productId: product_items.product_id,
				count: sql<number>`count(*)::int`,
				seconds: sql<number>`coalesce(sum(${media_assets.duration_seconds}), 0)::int`
			})
			.from(product_items)
			.innerJoin(lessons, eq(lessons.id, product_items.lesson_id))
			.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
			.where(inArray(product_items.product_id, productIds))
			.groupBy(product_items.product_id);
		for (const row of rows) totals.set(row.productId, { count: row.count, seconds: row.seconds });
		return totals;
	}

	/** The flagship unlocks the whole published course outline. */
	async function outlineTotals(): Promise<{ count: number; seconds: number }> {
		const outline = await content.outline();
		const all = outline.modules.flatMap((module) => module.lessons);
		return {
			count: all.length,
			seconds: all.reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0)
		};
	}

	async function toCatalogProducts(rows: Product[], now: Date): Promise<CatalogProduct[]> {
		const totals = await itemTotals(
			rows.filter((row) => row.access_scope !== 'all').map((row) => row.id)
		);
		const flagshipTotals = rows.some((row) => row.access_scope === 'all')
			? await outlineTotals()
			: null;
		return rows.map((row) => {
			const total =
				row.access_scope === 'all'
					? (flagshipTotals ?? { count: 0, seconds: 0 })
					: (totals.get(row.id) ?? { count: 0, seconds: 0 });
			return {
				...row,
				pricing: effectivePrice(row, now),
				itemCount: total.count,
				durationSeconds: total.seconds
			};
		});
	}

	async function lessonsFor(product: Product): Promise<ProductLesson[]> {
		if (product.access_scope === 'all') {
			const outline = await content.outline();
			return outline.modules.flatMap((module) =>
				module.lessons.map((lesson) => ({
					id: lesson.id,
					slug: lesson.slug,
					title: lesson.title,
					kind: lesson.kind,
					moduleId: module.id,
					moduleSlug: module.slug,
					moduleTitle: module.title,
					durationSeconds: lesson.durationSeconds,
					isFreePreview: lesson.isFreePreview,
					isPublished: true
				}))
			);
		}
		return db
			.select({
				id: lessons.id,
				slug: lessons.slug,
				title: lessons.title,
				kind: lessons.kind,
				moduleId: lessons.module_id,
				moduleSlug: modules.slug,
				moduleTitle: modules.title,
				durationSeconds: media_assets.duration_seconds,
				isFreePreview: lessons.is_free_preview,
				isPublished: lessons.is_published
			})
			.from(product_items)
			.innerJoin(lessons, eq(lessons.id, product_items.lesson_id))
			.leftJoin(modules, eq(modules.id, lessons.module_id))
			.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
			.where(eq(product_items.product_id, product.id))
			.orderBy(asc(product_items.sort_order), asc(lessons.title));
	}

	/** Sets `is_published` inside `tx`, checking the list first when publishing. */
	async function applyPublished(
		tx: Tx,
		product: Product,
		published: boolean,
		actorId?: string
	): Promise<Product> {
		if (published) {
			const unmet = checklistFor(product, await itemRows(tx, product.id));
			if (unmet.length > 0) throw new PublishBlockedError(unmet);
		}
		const [after] = await tx
			.update(products)
			.set({ is_published: published, updated_at: sql`now()` })
			.where(eq(products.id, product.id))
			.returning();
		await writeAudit(
			tx,
			actorId,
			published ? 'product.publish' : 'product.unpublish',
			product.id,
			{ is_published: product.is_published },
			{ is_published: after.is_published }
		);
		log.info(published ? 'product published' : 'product unpublished', { productId: product.id });
		return after;
	}

	/** After commit: the catalogue and the product page, under the old and the new slug. */
	async function refreshPages(before: Product, after: Product): Promise<void> {
		if (!revalidator || (!before.is_published && !after.is_published)) return;
		const paths = new Set(['/catalogue', `/products/${before.slug}`, `/products/${after.slug}`]);
		await revalidator.revalidate([...paths]);
	}

	async function setPublished(id: string, published: boolean, actorId?: string): Promise<Product> {
		const [before, after] = await withTx(db, async (tx) => {
			const product = await requireProduct(tx, id);
			return [product, await applyPublished(tx, product, published, actorId)] as const;
		});
		await refreshPages(before, after);
		return after;
	}

	/** Replaces the items inside `tx` under the kind rules; audited as `product.set_items`. */
	async function replaceItems(
		tx: Tx,
		product: Product,
		lessonIds: string[],
		actorId?: string
	): Promise<ProductItem[]> {
		const id = product.id;
		const ids = [...new Set(lessonIds)];
		if (product.kind === 'course' && ids.length > 0) {
			throw new DomainError('INVALID_ITEMS', 'The course has no item list');
		}
		if (product.kind === 'single' && ids.length !== 1) {
			throw new DomainError('INVALID_ITEMS', 'A single sells exactly one video');
		}
		if (ids.length > 0) {
			const found = await tx
				.select({ id: lessons.id })
				.from(lessons)
				.where(inArray(lessons.id, ids));
			if (found.length !== ids.length) {
				throw new DomainError('LESSON_NOT_FOUND', 'Lesson not found');
			}
		}
		const before = await tx
			.select()
			.from(product_items)
			.where(eq(product_items.product_id, id))
			.orderBy(asc(product_items.sort_order));
		await tx.delete(product_items).where(eq(product_items.product_id, id));
		const after =
			ids.length === 0
				? []
				: await tx
						.insert(product_items)
						.values(
							ids.map((lessonId, index) => ({
								product_id: id,
								lesson_id: lessonId,
								sort_order: index
							}))
						)
						.returning();
		await tx
			.update(products)
			.set({ updated_at: sql`now()` })
			.where(eq(products.id, id));
		await writeAudit(
			tx,
			actorId,
			'product.set_items',
			id,
			{ lessonIds: before.map((item) => item.lesson_id) },
			{ lessonIds: ids }
		);
		return after;
	}

	async function updateProduct(
		tx: Tx,
		before: Product,
		input: ProductInput,
		actorId?: string
	): Promise<Product> {
		await assertSlugFree(tx, input.slug, before.id);
		const [after] = await tx
			.update(products)
			.set({ ...productValues(input), updated_at: sql`now()` })
			.where(eq(products.id, before.id))
			.returning();
		await writeAudit(tx, actorId, 'product.update', before.id, before, after);
		return after;
	}

	/** Picker rows for the given lesson filter, with the products listing each lesson. */
	async function pickerRows(where: SQL, limit?: number): Promise<PickerLesson[]> {
		const query = db
			.select({
				id: lessons.id,
				title: lessons.title,
				moduleTitle: modules.title,
				durationSeconds: media_assets.duration_seconds,
				isPublished: lessons.is_published
			})
			.from(lessons)
			.leftJoin(modules, eq(modules.id, lessons.module_id))
			.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
			.where(where)
			.orderBy(asc(lessons.title), asc(lessons.id));
		const rows = limit === undefined ? await query : await query.limit(limit);
		if (rows.length === 0) return [];
		const listed = await db
			.select({
				lessonId: product_items.lesson_id,
				id: products.id,
				title: products.title
			})
			.from(product_items)
			.innerJoin(products, eq(products.id, product_items.product_id))
			.where(
				inArray(
					product_items.lesson_id,
					rows.map((row) => row.id)
				)
			)
			.orderBy(asc(products.title));
		return rows.map((row) => ({
			...row,
			products: listed
				.filter((item) => item.lessonId === row.id)
				.map((item) => ({ id: item.id, title: item.title }))
		}));
	}

	return {
		async flagship() {
			const product = await findFlagship(db);
			if (!product) throw new DomainError('NO_FLAGSHIP', 'No all-access course product exists');
			return product;
		},

		async listPublished({ kind, now = new Date() } = {}) {
			const filters: SQL[] = [eq(products.is_published, true)];
			if (kind) filters.push(eq(products.kind, kind));
			const rows = await db
				.select()
				.from(products)
				.where(and(...filters))
				.orderBy(...CATALOGUE_ORDER);
			return toCatalogProducts(rows, now);
		},

		async getPublishedBySlug(slug, now = new Date()) {
			const [row] = await db
				.select()
				.from(products)
				.where(and(eq(products.slug, slug), eq(products.is_published, true)))
				.limit(1);
			if (!row) return null;
			const [product] = await toCatalogProducts([row], now);
			return { ...product, lessons: await lessonsFor(row) };
		},

		listAll() {
			return db
				.select()
				.from(products)
				.orderBy(...CATALOGUE_ORDER);
		},

		async getById(id) {
			const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
			if (!product) return null;
			const items = await db
				.select()
				.from(product_items)
				.where(eq(product_items.product_id, id))
				.orderBy(asc(product_items.sort_order));
			return { ...product, items };
		},

		create: (input, actorId, lessonIds) =>
			withTx(db, async (tx) => {
				await assertSlugFree(tx, input.slug);
				if (input.kind === 'course' && (await findFlagship(tx))) {
					throw new DomainError('FLAGSHIP_EXISTS', 'There is already an all-access course product');
				}
				const [product] = await tx
					.insert(products)
					.values({
						...productValues(input),
						kind: input.kind,
						access_scope: input.kind === 'course' ? 'all' : 'items'
					})
					.returning();
				await writeAudit(tx, actorId, 'product.create', product.id, null, product);
				if (lessonIds) await replaceItems(tx, product, lessonIds, actorId);
				log.info('product created', { productId: product.id, kind: product.kind });
				return product;
			}),

		update: (id, input, actorId) =>
			withTx(db, async (tx) => updateProduct(tx, await requireProduct(tx, id), input, actorId)),

		updateFields: (id, fields, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireProduct(tx, id);
				return updateProduct(tx, before, { ...inputOf(before), ...fields }, actorId);
			}),

		async setVisibility(id, { isPublished, isFeatured, sortOrder }, actorId) {
			const [before, after] = await withTx(db, async (tx) => {
				const product = await requireProduct(tx, id);
				let current = product;
				if (isFeatured !== product.is_featured || sortOrder !== product.sort_order) {
					current = await updateProduct(
						tx,
						product,
						{ ...inputOf(product), isFeatured, sortOrder },
						actorId
					);
				}
				if (isPublished !== product.is_published) {
					current = await applyPublished(tx, current, isPublished, actorId);
				}
				return [product, current] as const;
			});
			await refreshPages(before, after);
			return after;
		},

		setItems: (id, lessonIds, actorId) =>
			withTx(db, async (tx) => replaceItems(tx, await requireProduct(tx, id), lessonIds, actorId)),

		async publishChecklist(id) {
			const product = await requireProduct(db, id);
			return checklistFor(product, await itemRows(db, id));
		},

		publish: (id, actorId) => setPublished(id, true, actorId),

		unpublish: (id, actorId) => setPublished(id, false, actorId),

		remove: (id, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireProduct(tx, id);
				const [sold] = await tx
					.select({ id: order_items.id })
					.from(order_items)
					.where(eq(order_items.product_id, id))
					.limit(1);
				const [owned] = sold
					? [sold]
					: await tx
							.select({ id: entitlements.id })
							.from(entitlements)
							.where(eq(entitlements.product_id, id))
							.limit(1);
				if (owned) {
					throw new DomainError(
						'PRODUCT_HAS_HISTORY',
						'This product has been sold or granted; unpublish it instead of deleting it'
					);
				}
				await tx.delete(products).where(eq(products.id, id));
				await writeAudit(tx, actorId, 'product.delete', id, before, null);
				log.info('product deleted', { productId: id });
			}),

		async productLessons(id) {
			return lessonsFor(await requireProduct(db, id));
		},

		async productsContainingLesson(lessonId, { publishedOnly = false } = {}) {
			const filters: SQL[] = [eq(product_items.lesson_id, lessonId)];
			if (publishedOnly) filters.push(eq(products.is_published, true));
			const rows = await db
				.select({ product: products })
				.from(product_items)
				.innerJoin(products, eq(products.id, product_items.product_id))
				.where(and(...filters))
				.orderBy(...CATALOGUE_ORDER);
			return rows.map((row) => row.product);
		},

		async cheapestProductForLesson(lessonId, now = new Date()) {
			const rows = await db
				.select({ product: products })
				.from(product_items)
				.innerJoin(products, eq(products.id, product_items.product_id))
				.where(and(eq(product_items.lesson_id, lessonId), eq(products.is_published, true)));
			let cheapest: LessonOffer | null = null;
			for (const { product } of rows) {
				const pricing = effectivePrice(product, now);
				if (!cheapest || pricing.price < cheapest.pricing.price) cheapest = { product, pricing };
			}
			if (cheapest) return cheapest;
			const [flagship] = await db
				.select()
				.from(products)
				.where(and(eq(products.access_scope, 'all'), eq(products.is_published, true)))
				.limit(1);
			return flagship ? { product: flagship, pricing: effectivePrice(flagship, now) } : null;
		},

		async listAllWithTotals(now = new Date()) {
			const rows = await db
				.select()
				.from(products)
				.orderBy(...CATALOGUE_ORDER);
			return toCatalogProducts(rows, now);
		},

		searchLessons(q) {
			const term = q.trim();
			const where = term
				? (or(
						ilike(lessons.title, likePattern(term)),
						ilike(modules.title, likePattern(term))
					) as SQL)
				: sql`true`;
			return pickerRows(where, LESSON_SEARCH_LIMIT);
		},

		async pickerLessons(ids) {
			if (ids.length === 0) return [];
			const rows = await pickerRows(inArray(lessons.id, [...ids]));
			const byId = new Map(rows.map((row) => [row.id, row]));
			return ids.flatMap((id) => byId.get(id) ?? []);
		}
	};
}
