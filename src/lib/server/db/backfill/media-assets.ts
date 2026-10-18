import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { renderMarkdown } from '../../modules/content/index.ts';
import type { Db } from '../index.ts';
import { lessons, media_assets } from '../schema/index.ts';

export interface MediaAssetCounts {
	/** Distinct Bunny videos that gained a `media_assets` row. */
	media_assets_inserted: number;
	/** Lessons whose `media_asset_id` was set from `video_url`. */
	lessons_linked: number;
	/** Article lessons moved to `kind = 'article'` with `content_html` filled. */
	articles_converted: number;
}

/** Legacy `lessons.video_url` for a Bunny Stream video: `bunny:{libraryId}/{videoId}`. */
const BUNNY_VIDEO_URL = /^bunny:(\d+)\/(.+)$/;

interface PendingAsset {
	library_id: string;
	video_id: string;
	title: string;
	duration_seconds: number | null;
}

/**
 * Creates one `media_assets` row (status `ready`) per distinct Bunny video
 * referenced by `lessons.video_url`, links every such lesson through
 * `media_asset_id`, and converts legacy article lessons to `kind = 'article'`
 * with `content_html` rendered from the legacy `content` HTML by
 * `renderMarkdown` (HTML passes through Markdown and is then sanitised, so
 * `content_html` only ever holds sanitiser output) and `content_md = NULL`. Every statement only touches rows that still need the
 * change, so a second run reports zeros.
 */
export async function backfillMediaAssets(db: Db): Promise<MediaAssetCounts> {
	const videoLessons = await db
		.select({
			title: lessons.title,
			video_url: lessons.video_url,
			duration_minutes: lessons.duration_minutes
		})
		.from(lessons)
		.where(isNotNull(lessons.video_url))
		// Lessons sharing a video: the first in course order supplies the duration.
		.orderBy(lessons.order_index, lessons.created_at, lessons.id);

	const pending = new Map<string, PendingAsset>();
	for (const lesson of videoLessons) {
		const match = lesson.video_url ? BUNNY_VIDEO_URL.exec(lesson.video_url) : null;
		if (!match) continue;
		const [, library_id, video_id] = match as unknown as [string, string, string];
		const key = `${library_id}/${video_id}`;
		const existing = pending.get(key);
		const duration_seconds = lesson.duration_minutes === null ? null : lesson.duration_minutes * 60;
		if (!existing) {
			pending.set(key, { library_id, video_id, title: lesson.title, duration_seconds });
		} else if (existing.duration_seconds === null && duration_seconds !== null) {
			existing.duration_seconds = duration_seconds;
		}
	}

	let media_assets_inserted = 0;
	if (pending.size > 0) {
		const inserted = await db
			.insert(media_assets)
			.values(
				[...pending.values()].map((asset) => ({
					provider: 'bunny',
					library_id: asset.library_id,
					video_id: asset.video_id,
					title: asset.title,
					duration_seconds: asset.duration_seconds,
					status: 'ready' as const
				}))
			)
			.onConflictDoNothing({ target: [media_assets.library_id, media_assets.video_id] })
			.returning({ id: media_assets.id });
		media_assets_inserted = inserted.length;
	}

	const linked = await db
		.update(lessons)
		.set({ media_asset_id: media_assets.id })
		.from(media_assets)
		.where(
			and(
				isNull(lessons.media_asset_id),
				eq(
					lessons.video_url,
					sql`'bunny:' || ${media_assets.library_id} || '/' || ${media_assets.video_id}`
				)
			)
		)
		.returning({ id: lessons.id });

	const articles = await db
		.select({ id: lessons.id, content: lessons.content })
		.from(lessons)
		.where(and(eq(lessons.lesson_type, 'article'), ne(lessons.kind, 'article')));
	for (const article of articles) {
		await db
			.update(lessons)
			.set({
				kind: 'article',
				content_md: null,
				content_html: renderMarkdown(article.content ?? '')
			})
			.where(eq(lessons.id, article.id));
	}

	return {
		media_assets_inserted,
		lessons_linked: linked.length,
		articles_converted: articles.length
	};
}
