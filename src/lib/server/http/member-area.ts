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
