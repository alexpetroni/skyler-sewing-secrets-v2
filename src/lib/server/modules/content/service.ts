import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type { Logger } from '#lib/server/platform/index.ts';
import {
	MAX_POSITION_SECONDS,
	type LessonInput,
	type ModuleInput
} from '#lib/shared/schemas/content.ts';
import { DomainError } from '../errors.ts';
import { renderMarkdown } from './markdown.ts';

const { modules, lessons, lesson_resources, user_progress, media_assets, product_items } = schema;

export type Module = typeof modules.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type LessonResource = typeof lesson_resources.$inferSelect;
export type Progress = typeof user_progress.$inferSelect;
export type MediaAssetRow = typeof media_assets.$inferSelect;

export { MAX_POSITION_SECONDS };

export interface OutlineLesson {
	id: string;
	slug: string;
	title: string;
	kind: Lesson['kind'];
	orderIndex: number;
	isFreePreview: boolean;
	mediaAssetId: string | null;
	durationSeconds: number | null;
}

export interface OutlineModule {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	thumbnailUrl: string | null;
	orderIndex: number;
	isBonus: boolean;
	lessons: OutlineLesson[];
}

export interface CourseOutline {
	modules: OutlineModule[];
	/** `modules` counts the non-bonus modules, as the legacy course overview did. */
	totals: { modules: number; bonusModules: number; videos: number; minutes: number };
}

export interface ProgressSummary {
	totalLessons: number;
	completedLessons: number;
	minutesWatched: number;
	perModule: Array<{
		moduleId: string;
		slug: string;
		title: string;
		totalLessons: number;
		completedLessons: number;
	}>;
}

export interface ProgressLesson {
	lessonId: string;
	lessonSlug: string;
	lessonTitle: string;
	moduleSlug: string | null;
	moduleTitle: string | null;
	positionSeconds: number;
	durationSeconds: number | null;
	completedAt: string | null;
	updatedAt: string;
}

export interface FreePreview {
	lesson: Lesson;
	module: Module | null;
	asset: MediaAssetRow | null;
}

export interface AddResourceInput {
	lessonId: string;
	title: string;
	fileUrl: string;
	fileType?: string | null;
	fileSizeBytes?: number | null;
}

export interface ProgressInput {
	userId: string;
	lessonId: string;
	completed?: boolean;
	positionSeconds?: number;
}

export interface ProgressFilter {
	lessonId?: string;
	moduleId?: string;
}

interface PublishedFilter {
	publishedOnly?: boolean;
}

export interface ContentService {
	modules: {
		list(params?: PublishedFilter): Promise<Module[]>;
		getBySlug(slug: string, params?: PublishedFilter): Promise<Module | null>;
		create(input: ModuleInput): Promise<Module>;
		update(id: string, input: ModuleInput): Promise<Module>;
		/** Sets `order_index` to each id's position in `ids`. */
		reorder(ids: string[]): Promise<void>;
		/** Refuses with `MODULE_HAS_SOLD_LESSONS` while a product lists one of its lessons. */
		remove(id: string): Promise<void>;
	};
	lessons: {
		create(input: LessonInput): Promise<Lesson>;
		update(id: string, input: LessonInput): Promise<Lesson>;
		/** Refuses a video lesson whose asset is missing or not `ready` (`MEDIA_NOT_READY`). */
		publish(id: string): Promise<Lesson>;
		/** Refuses with `LESSON_IN_PRODUCT` while a product lists the lesson. */
		remove(id: string): Promise<void>;
		/** With `publishedOnly`, both the module and the lesson must be published. */
		getBySlugs(
			moduleSlug: string,
			lessonSlug: string,
			params?: PublishedFilter
		): Promise<{ module: Module; lesson: Lesson } | null>;
		getStandaloneBySlug(slug: string, params?: PublishedFilter): Promise<Lesson | null>;
		getById(id: string, params?: PublishedFilter): Promise<Lesson | null>;
		listStandalone(params?: PublishedFilter): Promise<Lesson[]>;
		listByModule(moduleId: string): Promise<Lesson[]>;
		/** The attached asset's duration; null without an asset or before Bunny reports one. */
		durationSeconds(lesson: Pick<Lesson, 'media_asset_id'>): Promise<number | null>;
	};
	/** Published course modules with their published lessons and the course totals. */
	outline(): Promise<CourseOutline>;
	resources: {
		listForLesson(lessonId: string): Promise<LessonResource[]>;
		/** A resource with the lesson it belongs to, for the download access check. */
		getById(id: string): Promise<{ resource: LessonResource; lesson: Lesson } | null>;
		add(input: AddResourceInput): Promise<LessonResource>;
		remove(id: string): Promise<void>;
	};
	progress: {
		upsert(input: ProgressInput): Promise<Progress>;
		/** Newest first; `moduleId` narrows to the module's published lessons. */
		forUser(userId: string, filter?: ProgressFilter): Promise<Progress[]>;
		/** Progress across the course outline (published course modules and lessons). */
		summary(userId: string): Promise<ProgressSummary>;
		continueWatching(userId: string, limit: number): Promise<ProgressLesson[]>;
		recentlyCompleted(userId: string, limit: number): Promise<ProgressLesson[]>;
	};
	/** The homepage preview: first published free-preview lesson by module, then lesson order. */
	freePreviewLesson(): Promise<FreePreview | null>;
}

export interface CreateContentServiceDeps {
	db: Db;
	log: Logger;
}

const MODULE_ORDER = [asc(modules.order_index), asc(modules.title)];
const LESSON_ORDER = [asc(lessons.order_index), asc(lessons.title)];

function moduleValues(input: ModuleInput) {
	return {
		title: input.title,
		slug: input.slug,
		description: input.description || null,
		thumbnail_url: input.thumbnailUrl || null,
		order_index: input.orderIndex,
		is_published: input.isPublished,
		is_bonus: input.isBonus,
		is_course_content: input.isCourseContent
	};
}

function lessonValues(input: LessonInput) {
	return {
		module_id: input.moduleId,
		title: input.title,
		slug: input.slug,
		kind: input.kind,
		// The legacy column the old app still reads, kept in step with `kind`.
		lesson_type: input.kind,
		media_asset_id: input.mediaAssetId,
		description: input.description || null,
		content_md: input.contentMd,
		// Always recomputed: `content_html` is never accepted from a caller.
		content_html: renderMarkdown(input.contentMd),
		is_free_preview: input.isFreePreview,
		is_published: input.isPublished,
		order_index: input.orderIndex
	};
}

export function createContentService({ db, log }: CreateContentServiceDeps): ContentService {
	async function assertModuleSlugFree(tx: Tx, slug: string, exceptId?: string): Promise<void> {
		const filters: SQL[] = [eq(modules.slug, slug)];
		if (exceptId) filters.push(ne(modules.id, exceptId));
		const [taken] = await tx
			.select({ id: modules.id })
			.from(modules)
			.where(and(...filters))
			.limit(1);
		if (taken) throw new DomainError('SLUG_TAKEN', 'This slug is already in use');
	}

	/** Lesson slugs are unique within a module; standalone slugs share one namespace. */
	async function assertLessonSlugFree(
		tx: Tx,
		moduleId: string | null,
		slug: string,
		exceptId?: string
	): Promise<void> {
		const filters: SQL[] = [
			eq(lessons.slug, slug),
			moduleId ? eq(lessons.module_id, moduleId) : isNull(lessons.module_id)
		];
		if (exceptId) filters.push(ne(lessons.id, exceptId));
		const [taken] = await tx
			.select({ id: lessons.id })
			.from(lessons)
			.where(and(...filters))
			.limit(1);
		if (taken) {
			throw new DomainError(
				'SLUG_TAKEN',
				moduleId
					? 'This slug is already in use in this module'
					: 'This slug is already used by another standalone video'
			);
		}
	}

	async function assertLessonReferences(tx: Tx, input: LessonInput): Promise<void> {
		if (input.moduleId) {
			const [module] = await tx
				.select({ id: modules.id })
				.from(modules)
				.where(eq(modules.id, input.moduleId))
				.limit(1);
			if (!module) throw new DomainError('MODULE_NOT_FOUND', 'Module not found');
		}
		if (input.mediaAssetId) {
			const [asset] = await tx
				.select({ id: media_assets.id })
				.from(media_assets)
				.where(eq(media_assets.id, input.mediaAssetId))
				.limit(1);
			if (!asset) throw new DomainError('MEDIA_NOT_FOUND', 'Media asset not found');
		}
	}

	/** A published video lesson must play a `ready` asset. Module state is irrelevant (legacy). */
	async function assertPublishable(
		tx: Tx,
		lesson: { kind: Lesson['kind']; media_asset_id: string | null }
	): Promise<void> {
		if (lesson.kind !== 'video') return;
		const asset = lesson.media_asset_id
			? (
					await tx
						.select({ status: media_assets.status })
						.from(media_assets)
						.where(eq(media_assets.id, lesson.media_asset_id))
						.limit(1)
				)[0]
			: undefined;
		if (asset?.status !== 'ready') {
			throw new DomainError(
				'MEDIA_NOT_READY',
				'Attach a video that has finished processing before publishing'
			);
		}
	}

	async function requireLesson(executor: Db | Tx, id: string): Promise<Lesson> {
		const [lesson] = await executor.select().from(lessons).where(eq(lessons.id, id)).limit(1);
		if (!lesson) throw new DomainError('LESSON_NOT_FOUND', 'Lesson not found');
		return lesson;
	}

	async function getModuleBySlug(slug: string, { publishedOnly = false }: PublishedFilter = {}) {
		const filters: SQL[] = [eq(modules.slug, slug)];
		if (publishedOnly) filters.push(eq(modules.is_published, true));
		const [module] = await db
			.select()
			.from(modules)
			.where(and(...filters))
			.limit(1);
		return module ?? null;
	}

	async function outline(): Promise<CourseOutline> {
		const moduleRows = await db
			.select()
			.from(modules)
			.where(and(eq(modules.is_published, true), eq(modules.is_course_content, true)))
			.orderBy(...MODULE_ORDER);
		const lessonRows =
			moduleRows.length === 0
				? []
				: await db
						.select({
							id: lessons.id,
							moduleId: lessons.module_id,
							slug: lessons.slug,
							title: lessons.title,
							kind: lessons.kind,
							orderIndex: lessons.order_index,
							isFreePreview: lessons.is_free_preview,
							mediaAssetId: lessons.media_asset_id,
							durationSeconds: media_assets.duration_seconds
						})
						.from(lessons)
						.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
						.where(
							and(
								eq(lessons.is_published, true),
								inArray(
									lessons.module_id,
									moduleRows.map((module) => module.id)
								)
							)
						)
						.orderBy(...LESSON_ORDER);

		const outlineModules: OutlineModule[] = moduleRows.map((module) => ({
			id: module.id,
			slug: module.slug,
			title: module.title,
			description: module.description,
			thumbnailUrl: module.thumbnail_url,
			orderIndex: module.order_index,
			isBonus: module.is_bonus,
			lessons: lessonRows
				.filter((lesson) => lesson.moduleId === module.id)
				.map((lesson) => ({
					id: lesson.id,
					slug: lesson.slug,
					title: lesson.title,
					kind: lesson.kind,
					orderIndex: lesson.orderIndex,
					isFreePreview: lesson.isFreePreview,
					mediaAssetId: lesson.mediaAssetId,
					durationSeconds: lesson.durationSeconds
				}))
		}));
		const allLessons = outlineModules.flatMap((module) => module.lessons);
		const seconds = allLessons.reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0);

		return {
			modules: outlineModules,
			totals: {
				modules: outlineModules.filter((module) => !module.isBonus).length,
				bonusModules: outlineModules.filter((module) => module.isBonus).length,
				videos: allLessons.filter((lesson) => lesson.kind === 'video').length,
				minutes: Math.round(seconds / 60)
			}
		};
	}

	function progressLessons(userId: string, completed: boolean, limit: number) {
		return db
			.select({
				lessonId: lessons.id,
				lessonSlug: lessons.slug,
				lessonTitle: lessons.title,
				moduleSlug: modules.slug,
				moduleTitle: modules.title,
				positionSeconds: user_progress.last_position_seconds,
				durationSeconds: media_assets.duration_seconds,
				completedAt: user_progress.completed_at,
				updatedAt: user_progress.updated_at
			})
			.from(user_progress)
			.innerJoin(lessons, eq(lessons.id, user_progress.lesson_id))
			.leftJoin(modules, eq(modules.id, lessons.module_id))
			.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
			.where(
				and(
					eq(user_progress.user_id, userId),
					eq(lessons.is_published, true),
					or(isNull(lessons.module_id), eq(modules.is_published, true)),
					completed
						? eq(user_progress.completed, true)
						: and(eq(user_progress.completed, false), gt(user_progress.last_position_seconds, 0))
				)
			)
			.orderBy(
				completed ? desc(user_progress.completed_at) : desc(user_progress.updated_at),
				asc(lessons.id)
			)
			.limit(limit);
	}

	return {
		modules: {
			async list({ publishedOnly = false } = {}) {
				return db
					.select()
					.from(modules)
					.where(publishedOnly ? eq(modules.is_published, true) : undefined)
					.orderBy(...MODULE_ORDER);
			},

			getBySlug: getModuleBySlug,

			create: (input) =>
				withTx(db, async (tx) => {
					await assertModuleSlugFree(tx, input.slug);
					const [module] = await tx.insert(modules).values(moduleValues(input)).returning();
					log.info('module created', { moduleId: module.id });
					return module;
				}),

			update: (id, input) =>
				withTx(db, async (tx) => {
					await assertModuleSlugFree(tx, input.slug, id);
					const [module] = await tx
						.update(modules)
						.set({ ...moduleValues(input), updated_at: sql`now()` })
						.where(eq(modules.id, id))
						.returning();
					if (!module) throw new DomainError('MODULE_NOT_FOUND', 'Module not found');
					return module;
				}),

			reorder: (ids) =>
				withTx(db, async (tx) => {
					for (const [index, id] of ids.entries()) {
						const updated = await tx
							.update(modules)
							.set({ order_index: index, updated_at: sql`now()` })
							.where(eq(modules.id, id))
							.returning({ id: modules.id });
						if (updated.length === 0) {
							throw new DomainError('MODULE_NOT_FOUND', 'Module not found');
						}
					}
				}),

			remove: (id) =>
				withTx(db, async (tx) => {
					const [sold] = await tx
						.select({ lessonId: product_items.lesson_id })
						.from(product_items)
						.innerJoin(lessons, eq(lessons.id, product_items.lesson_id))
						.where(eq(lessons.module_id, id))
						.limit(1);
					if (sold) {
						throw new DomainError(
							'MODULE_HAS_SOLD_LESSONS',
							'A lesson of this module is part of a product; remove it from the product first'
						);
					}
					// Lessons, their resources and progress go with the module (ON DELETE CASCADE).
					const removed = await tx
						.delete(modules)
						.where(eq(modules.id, id))
						.returning({ id: modules.id });
					if (removed.length === 0) throw new DomainError('MODULE_NOT_FOUND', 'Module not found');
					log.info('module removed', { moduleId: id });
				})
		},

		lessons: {
			create: (input) =>
				withTx(db, async (tx) => {
					await assertLessonReferences(tx, input);
					await assertLessonSlugFree(tx, input.moduleId, input.slug);
					if (input.isPublished) {
						await assertPublishable(tx, { kind: input.kind, media_asset_id: input.mediaAssetId });
					}
					const [lesson] = await tx.insert(lessons).values(lessonValues(input)).returning();
					log.info('lesson created', { lessonId: lesson.id });
					return lesson;
				}),

			update: (id, input) =>
				withTx(db, async (tx) => {
					await requireLesson(tx, id);
					await assertLessonReferences(tx, input);
					await assertLessonSlugFree(tx, input.moduleId, input.slug, id);
					if (input.isPublished) {
						await assertPublishable(tx, { kind: input.kind, media_asset_id: input.mediaAssetId });
					}
					const [lesson] = await tx
						.update(lessons)
						.set({ ...lessonValues(input), updated_at: sql`now()` })
						.where(eq(lessons.id, id))
						.returning();
					return lesson;
				}),

			publish: (id) =>
				withTx(db, async (tx) => {
					const lesson = await requireLesson(tx, id);
					await assertPublishable(tx, lesson);
					const [published] = await tx
						.update(lessons)
						.set({ is_published: true, updated_at: sql`now()` })
						.where(eq(lessons.id, id))
						.returning();
					log.info('lesson published', { lessonId: id });
					return published;
				}),

			remove: (id) =>
				withTx(db, async (tx) => {
					await requireLesson(tx, id);
					const [sold] = await tx
						.select({ productId: product_items.product_id })
						.from(product_items)
						.where(eq(product_items.lesson_id, id))
						.limit(1);
					if (sold) {
						throw new DomainError(
							'LESSON_IN_PRODUCT',
							'This lesson is part of a product; remove it from the product first'
						);
					}
					await tx.delete(lessons).where(eq(lessons.id, id));
					log.info('lesson removed', { lessonId: id });
				}),

			async getBySlugs(moduleSlug, lessonSlug, { publishedOnly = false } = {}) {
				const module = await getModuleBySlug(moduleSlug, { publishedOnly });
				if (!module) return null;
				const filters: SQL[] = [eq(lessons.module_id, module.id), eq(lessons.slug, lessonSlug)];
				if (publishedOnly) filters.push(eq(lessons.is_published, true));
				const [lesson] = await db
					.select()
					.from(lessons)
					.where(and(...filters))
					.limit(1);
				return lesson ? { module, lesson } : null;
			},

			async getStandaloneBySlug(slug, { publishedOnly = false } = {}) {
				const filters: SQL[] = [isNull(lessons.module_id), eq(lessons.slug, slug)];
				if (publishedOnly) filters.push(eq(lessons.is_published, true));
				const [lesson] = await db
					.select()
					.from(lessons)
					.where(and(...filters))
					.limit(1);
				return lesson ?? null;
			},

			async getById(id, { publishedOnly = false } = {}) {
				const filters: SQL[] = [eq(lessons.id, id)];
				if (publishedOnly) filters.push(eq(lessons.is_published, true));
				const [lesson] = await db
					.select()
					.from(lessons)
					.where(and(...filters))
					.limit(1);
				return lesson ?? null;
			},

			async listStandalone({ publishedOnly = false } = {}) {
				const filters: SQL[] = [isNull(lessons.module_id)];
				if (publishedOnly) filters.push(eq(lessons.is_published, true));
				return db
					.select()
					.from(lessons)
					.where(and(...filters))
					.orderBy(...LESSON_ORDER);
			},

			async listByModule(moduleId) {
				return db
					.select()
					.from(lessons)
					.where(eq(lessons.module_id, moduleId))
					.orderBy(...LESSON_ORDER);
			},

			async durationSeconds(lesson) {
				if (!lesson.media_asset_id) return null;
				const [asset] = await db
					.select({ durationSeconds: media_assets.duration_seconds })
					.from(media_assets)
					.where(eq(media_assets.id, lesson.media_asset_id))
					.limit(1);
				return asset?.durationSeconds ?? null;
			}
		},

		outline,

		resources: {
			async listForLesson(lessonId) {
				return db
					.select()
					.from(lesson_resources)
					.where(eq(lesson_resources.lesson_id, lessonId))
					.orderBy(asc(lesson_resources.created_at), asc(lesson_resources.id));
			},

			async getById(id) {
				const [row] = await db
					.select({ resource: lesson_resources, lesson: lessons })
					.from(lesson_resources)
					.innerJoin(lessons, eq(lessons.id, lesson_resources.lesson_id))
					.where(eq(lesson_resources.id, id))
					.limit(1);
				return row ?? null;
			},

			async add(input) {
				// Rendered as a link on the lesson page, so only https is accepted.
				if (!/^https:\/\/\S+$/i.test(input.fileUrl)) {
					throw new DomainError('INVALID_URL', 'Must be an https:// URL');
				}
				await requireLesson(db, input.lessonId);
				const [resource] = await db
					.insert(lesson_resources)
					.values({
						lesson_id: input.lessonId,
						title: input.title,
						file_url: input.fileUrl,
						file_type: input.fileType ?? null,
						file_size_bytes: input.fileSizeBytes ?? null
					})
					.returning();
				return resource;
			},

			async remove(id) {
				const removed = await db
					.delete(lesson_resources)
					.where(eq(lesson_resources.id, id))
					.returning({ id: lesson_resources.id });
				if (removed.length === 0) {
					throw new DomainError('RESOURCE_NOT_FOUND', 'Resource not found');
				}
			}
		},

		progress: {
			async upsert({ userId, lessonId, completed, positionSeconds }) {
				if (
					positionSeconds !== undefined &&
					(!Number.isInteger(positionSeconds) ||
						positionSeconds < 0 ||
						positionSeconds > MAX_POSITION_SECONDS)
				) {
					throw new DomainError(
						'INVALID_POSITION',
						`Position must be a whole number of seconds between 0 and ${MAX_POSITION_SECONDS}`
					);
				}
				// Progress is recorded only against a lesson that exists and is published.
				const [lesson] = await db
					.select({ id: lessons.id })
					.from(lessons)
					.where(and(eq(lessons.id, lessonId), eq(lessons.is_published, true)))
					.limit(1);
				if (!lesson) throw new DomainError('LESSON_NOT_FOUND', 'Lesson not found');

				const changes = {
					...(completed === undefined
						? {}
						: { completed, completed_at: completed ? sql`now()` : null }),
					...(positionSeconds === undefined ? {} : { last_position_seconds: positionSeconds })
				};
				const [row] = await db
					.insert(user_progress)
					.values({ user_id: userId, lesson_id: lessonId, ...changes })
					.onConflictDoUpdate({
						target: [user_progress.user_id, user_progress.lesson_id],
						set: { ...changes, updated_at: sql`now()` }
					})
					.returning();
				return row;
			},

			async forUser(userId, { lessonId, moduleId } = {}) {
				const filters: SQL[] = [eq(user_progress.user_id, userId)];
				if (lessonId) filters.push(eq(user_progress.lesson_id, lessonId));
				if (moduleId) {
					const moduleLessons = db
						.select({ id: lessons.id })
						.from(lessons)
						.where(and(eq(lessons.module_id, moduleId), eq(lessons.is_published, true)));
					filters.push(inArray(user_progress.lesson_id, moduleLessons));
				}
				return db
					.select()
					.from(user_progress)
					.where(and(...filters))
					.orderBy(desc(user_progress.updated_at), asc(user_progress.id));
			},

			async summary(userId) {
				const course = await outline();
				const lessonIds = course.modules.flatMap((module) =>
					module.lessons.map((lesson) => lesson.id)
				);
				const rows =
					lessonIds.length === 0
						? []
						: await db
								.select()
								.from(user_progress)
								.where(
									and(
										eq(user_progress.user_id, userId),
										inArray(user_progress.lesson_id, lessonIds)
									)
								);
				const progressByLesson = new Map(rows.map((row) => [row.lesson_id, row]));

				let watchedSeconds = 0;
				const perModule = course.modules.map((module) => {
					let completedLessons = 0;
					for (const lesson of module.lessons) {
						const progress = progressByLesson.get(lesson.id);
						if (!progress) continue;
						if (progress.completed) completedLessons += 1;
						const duration = lesson.durationSeconds ?? 0;
						// A completed lesson counts in full; otherwise up to the saved position.
						watchedSeconds += progress.completed
							? duration
							: Math.min(progress.last_position_seconds, duration);
					}
					return {
						moduleId: module.id,
						slug: module.slug,
						title: module.title,
						totalLessons: module.lessons.length,
						completedLessons
					};
				});

				return {
					totalLessons: lessonIds.length,
					completedLessons: perModule.reduce((sum, module) => sum + module.completedLessons, 0),
					minutesWatched: Math.floor(watchedSeconds / 60),
					perModule
				};
			},

			continueWatching: (userId, limit) => progressLessons(userId, false, limit),

			recentlyCompleted: (userId, limit) => progressLessons(userId, true, limit)
		},

		async freePreviewLesson() {
			const [row] = await db
				.select({ lesson: lessons, module: modules, asset: media_assets })
				.from(lessons)
				.leftJoin(modules, eq(modules.id, lessons.module_id))
				.leftJoin(media_assets, eq(media_assets.id, lessons.media_asset_id))
				.where(
					and(
						eq(lessons.is_published, true),
						eq(lessons.is_free_preview, true),
						or(isNull(lessons.module_id), eq(modules.is_published, true))
					)
				)
				.orderBy(sql`${modules.order_index} asc nulls last`, ...LESSON_ORDER, asc(lessons.id))
				.limit(1);
			return row ?? null;
		}
	};
}
