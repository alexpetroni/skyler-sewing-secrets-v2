import { error, type RequestEvent } from '@sveltejs/kit';
import type {
	LessonLockState,
	LessonPage,
	LessonPageBase,
	UnlockOffer
} from '#lib/components/course/types.ts';
import { SUSPENDED_MESSAGE } from '#lib/server/modules/auth/index.ts';
import type { CatalogService, LessonOffer } from '#lib/server/modules/catalog/index.ts';
import type { Lesson, Module, Progress } from '#lib/server/modules/content/index.ts';
import {
	canAccessLesson,
	lockState,
	type AccessContext
} from '#lib/server/modules/entitlements/index.ts';
import { lessonHref } from '#lib/shared/lessons.ts';

/**
 * Member-area helpers: the visitor's access context (one entitlement query
 * per request) and the lesson page, shared by course lessons and standalone
 * videos. Every decision goes through `canAccessLesson` / `lockState`.
 */

const contexts = new WeakMap<App.Locals, Promise<AccessContext>>();

const ANONYMOUS: AccessContext = {
	profile: null,
	accessibleLessonIds: new Set(),
	isAdmin: false
};

async function buildAccessContext(locals: App.Locals): Promise<AccessContext> {
	const { user, profile, access, services } = locals;
	if (!user || !profile) return ANONYMOUS;
	// A suspended account opens free previews only, whatever it owns.
	if (profile.is_suspended) {
		return { profile: { is_suspended: true }, accessibleLessonIds: new Set(), isAdmin: false };
	}
	return {
		profile: { is_suspended: false },
		accessibleLessonIds: await services.entitlements.accessibleLessonIds(user.id),
		isAdmin: access.isAdmin
	};
}

/** The visitor's access context, computed once per request. */
export function accessContext(locals: App.Locals): Promise<AccessContext> {
	let context = contexts.get(locals);
	if (!context) {
		context = buildAccessContext(locals);
		contexts.set(locals, context);
	}
	return context;
}

interface LessonRef {
	id: string;
	isFreePreview: boolean;
}

/** Access through ownership (or admin), not through the free-preview flag. */
export function ownsLesson(ctx: AccessContext, lesson: LessonRef): boolean {
	return canAccessLesson(ctx, { id: lesson.id, isFreePreview: false });
}

/** The signed-in, unsuspended viewer's progress by lesson id; empty for everyone else. */
export async function progressByLesson(locals: App.Locals): Promise<Map<string, Progress>> {
	const { user, profile, services } = locals;
	if (!user || !profile || profile.is_suspended) return new Map();
	const rows = await services.content.progress.forUser(user.id);
	return new Map(rows.map((row) => [row.lesson_id, row]));
}

function toOffer({ product, pricing }: LessonOffer): UnlockOffer {
	return {
		slug: product.slug,
		title: product.title,
		kind: product.kind,
		pricing: { price: pricing.price, listPrice: pricing.listPrice, onSale: pricing.onSale }
	};
}

/** What unlocks a lesson: the cheapest published product listing it and the published flagship. */
export async function unlockOptions(
	catalog: CatalogService,
	lessonId: string,
	now = new Date()
): Promise<{ cheapest: UnlockOffer | null; flagship: UnlockOffer | null }> {
	const [cheapest, courses] = await Promise.all([
		catalog.cheapestProductForLesson(lessonId, now),
		catalog.listPublished({ kind: 'course', now })
	]);
	const flagship = courses.find((product) => product.access_scope === 'all');
	return {
		cheapest: cheapest && toOffer(cheapest),
		flagship: flagship ? toOffer({ product: flagship, pricing: flagship.pricing }) : null
	};
}

interface SiblingSource {
	id: string;
	slug: string;
	title: string;
	isFreePreview: boolean;
	durationSeconds: number | null;
}

async function siblingSources(locals: App.Locals, module: Module | null): Promise<SiblingSource[]> {
	const { content } = locals.services;
	if (!module) {
		const standalone = await content.lessons.listStandalone({ publishedOnly: true });
		return standalone.map((lesson) => ({
			id: lesson.id,
			slug: lesson.slug,
			title: lesson.title,
			isFreePreview: lesson.is_free_preview,
			durationSeconds: null
		}));
	}
	// Course modules come with durations from the outline; other collections without.
	const outline = await content.outline();
	const outlined = outline.modules.find((entry) => entry.id === module.id);
	if (outlined) return outlined.lessons;
	const lessons = await content.lessons.listByModule(module.id);
	return lessons
		.filter((lesson) => lesson.is_published)
		.map((lesson) => ({
			id: lesson.id,
			slug: lesson.slug,
			title: lesson.title,
			isFreePreview: lesson.is_free_preview,
			durationSeconds: null
		}));
}

/**
 * The lesson page for a published lesson (the route has already 404ed a
 * missing or unpublished one). Locked → upsell data only, never the embed,
 * the body or the resources; suspended (outside free previews) → 403.
 */
export async function lessonPage(
	event: RequestEvent,
	lesson: Lesson,
	module: Module | null
): Promise<LessonPage> {
	const { locals } = event;
	const { services } = locals;
	const ctx = await accessContext(locals);
	const ref = { id: lesson.id, isFreePreview: lesson.is_free_preview };
	const state: LessonLockState = lockState(ctx, ref);
	if (state === 'suspended') error(403, SUSPENDED_MESSAGE);

	const [sources, progress] = await Promise.all([
		siblingSources(locals, module),
		progressByLesson(locals)
	]);
	const base: LessonPageBase = {
		lesson: {
			id: lesson.id,
			slug: lesson.slug,
			title: lesson.title,
			description: lesson.description,
			kind: lesson.kind,
			isFreePreview: lesson.is_free_preview
		},
		module: module && { slug: module.slug, title: module.title },
		siblings: sources.map((sibling) => ({
			id: sibling.id,
			title: sibling.title,
			href: lessonHref(module?.slug ?? null, sibling.slug),
			durationSeconds: sibling.durationSeconds,
			lockState: lockState(ctx, sibling),
			completed: progress.get(sibling.id)?.completed ?? false
		})),
		ownsAllSiblings: sources.length > 0 && sources.every((sibling) => ownsLesson(ctx, sibling))
	};

	if (state === 'locked') {
		return {
			...base,
			locked: true,
			unlockOptions: await unlockOptions(services.catalog, lesson.id),
			signInHref: locals.user
				? null
				: `/auth/sign-in?redirectTo=${encodeURIComponent(event.url.pathname)}`
		};
	}

	const owner = ownsLesson(ctx, ref);
	const [asset, resources] = await Promise.all([
		lesson.kind === 'video' && lesson.media_asset_id
			? services.media.get(lesson.media_asset_id)
			: null,
		owner ? services.content.resources.listForLesson(lesson.id) : []
	]);
	const own = progress.get(lesson.id);
	return {
		...base,
		locked: false,
		embedUrl: asset
			? await services.videoHost.embedUrl({ libraryId: asset.library_id, videoId: asset.video_id })
			: null,
		contentHtml: lesson.content_html,
		durationSeconds: asset?.duration_seconds ?? null,
		resources: resources.map((resource) => ({
			id: resource.id,
			title: resource.title,
			fileType: resource.file_type,
			fileSizeBytes: resource.file_size_bytes
		})),
		startAt: own && !own.completed ? own.last_position_seconds : 0,
		completed: own?.completed ?? false,
		canTrackProgress: !!locals.user && !!locals.profile && !locals.profile.is_suspended
	};
}

/** The published flagship for the outline pages' calls to action. */
async function flagshipLink(
	catalog: CatalogService
): Promise<{ slug: string; title: string } | null> {
	const courses = await catalog.listPublished({ kind: 'course' });
	const flagship = courses.find((product) => product.access_scope === 'all');
	return flagship ? { slug: flagship.slug, title: flagship.title } : null;
}

/** The public course outline with the viewer's lock state and progress per lesson. */
export async function courseOutlinePage(locals: App.Locals) {
	const { content, catalog } = locals.services;
	const [outline, ctx, progress, flagship] = await Promise.all([
		content.outline(),
		accessContext(locals),
		progressByLesson(locals),
		flagshipLink(catalog)
	]);
	const modules = outline.modules.map((module) => ({
		id: module.id,
		slug: module.slug,
		title: module.title,
		description: module.description,
		isBonus: module.isBonus,
		lessons: module.lessons.map((lesson) => ({
			id: lesson.id,
			durationSeconds: lesson.durationSeconds,
			isFreePreview: lesson.isFreePreview,
			lockState: lockState(ctx, lesson),
			completed: progress.get(lesson.id)?.completed ?? false
		})),
		owned: module.lessons.length > 0 && module.lessons.every((lesson) => ownsLesson(ctx, lesson))
	}));
	return {
		modules,
		totals: outline.totals,
		flagship,
		ownsCourse: modules.length > 0 && modules.every((module) => module.owned)
	};
}

/** One published module's lessons with lock state and progress; null when there is none. */
export async function modulePage(locals: App.Locals, slug: string) {
	const { content, catalog } = locals.services;
	const module = await content.modules.getBySlug(slug, { publishedOnly: true });
	if (!module) return null;
	const [rows, outline, ctx, progress, flagship] = await Promise.all([
		content.lessons.listByModule(module.id),
		content.outline(),
		accessContext(locals),
		progressByLesson(locals),
		flagshipLink(catalog)
	]);
	// Durations come with the outline (course modules); other collections show none.
	const durations = new Map(
		outline.modules.flatMap((entry) =>
			entry.lessons.map((lesson) => [lesson.id, lesson.durationSeconds] as const)
		)
	);
	const lessons = rows
		.filter((lesson) => lesson.is_published)
		.map((lesson) => {
			const ref = { id: lesson.id, isFreePreview: lesson.is_free_preview };
			return {
				id: lesson.id,
				title: lesson.title,
				description: lesson.description,
				href: lessonHref(module.slug, lesson.slug),
				durationSeconds: durations.get(lesson.id) ?? null,
				isFreePreview: lesson.is_free_preview,
				lockState: lockState(ctx, ref),
				completed: progress.get(lesson.id)?.completed ?? false,
				owned: ownsLesson(ctx, ref)
			};
		});
	return {
		module: {
			slug: module.slug,
			title: module.title,
			description: module.description,
			thumbnailUrl: module.thumbnail_url,
			orderIndex: module.order_index,
			isBonus: module.is_bonus
		},
		lessons,
		owned: lessons.length > 0 && lessons.every((lesson) => lesson.owned),
		flagship
	};
}

const CONTINUE_WATCHING = 3;
const RECENTLY_COMPLETED = 5;

/**
 * Everything the user owns, grouped: the flagship as the course outline with
 * per-module progress, bundles and singles with their lessons and progress.
 */
export async function libraryPage(locals: App.Locals, userId: string) {
	const { content, catalog, entitlements } = locals.services;
	const [owned, progress, continueWatching, recentlyCompleted] = await Promise.all([
		entitlements.listForUser(userId),
		progressByLesson(locals),
		content.progress.continueWatching(userId, CONTINUE_WATCHING),
		content.progress.recentlyCompleted(userId, RECENTLY_COMPLETED)
	]);

	// Lesson id → duration, for every lesson listed; drives the summary numbers.
	const listed = new Map<string, number | null>();

	const courseEntitlement = owned.find((entitlement) => entitlement.product.kind === 'course');
	let course = null;
	if (courseEntitlement) {
		const [outline, summary] = await Promise.all([
			content.outline(),
			content.progress.summary(userId)
		]);
		for (const lesson of outline.modules.flatMap((module) => module.lessons)) {
			listed.set(lesson.id, lesson.durationSeconds);
		}
		course = {
			slug: courseEntitlement.product.slug,
			title: courseEntitlement.product.title,
			grantedAt: courseEntitlement.granted_at,
			modules: summary.perModule.map((module) => ({
				slug: module.slug,
				title: module.title,
				totalLessons: module.totalLessons,
				completedLessons: module.completedLessons
			}))
		};
	}

	const collections = await Promise.all(
		owned
			.filter((entitlement) => entitlement.product.kind !== 'course')
			.map(async (entitlement) => {
				const lessons = (await catalog.productLessons(entitlement.product_id)).filter(
					(lesson) => lesson.isPublished
				);
				for (const lesson of lessons) listed.set(lesson.id, lesson.durationSeconds);
				return {
					slug: entitlement.product.slug,
					title: entitlement.product.title,
					kind: entitlement.product.kind,
					grantedAt: entitlement.granted_at,
					lessons: lessons.map((lesson) => ({
						id: lesson.id,
						title: lesson.title,
						href: lessonHref(lesson.moduleSlug, lesson.slug),
						durationSeconds: lesson.durationSeconds,
						completed: progress.get(lesson.id)?.completed ?? false
					}))
				};
			})
	);

	let completedLessons = 0;
	let watchedSeconds = 0;
	for (const [lessonId, duration] of listed) {
		const row = progress.get(lessonId);
		if (!row) continue;
		if (row.completed) completedLessons += 1;
		// A completed lesson counts in full; otherwise up to the saved position.
		watchedSeconds += row.completed
			? (duration ?? 0)
			: Math.min(row.last_position_seconds, duration ?? 0);
	}

	const withHref = (lesson: (typeof continueWatching)[number]) => ({
		...lesson,
		href: lessonHref(lesson.moduleSlug, lesson.lessonSlug)
	});

	return {
		course,
		collections,
		continueWatching: continueWatching.map(withHref),
		recentlyCompleted: recentlyCompleted.map(withHref),
		summary: {
			products: owned.length,
			lessons: listed.size,
			completedLessons,
			minutesWatched: Math.floor(watchedSeconds / 60)
		}
	};
}
