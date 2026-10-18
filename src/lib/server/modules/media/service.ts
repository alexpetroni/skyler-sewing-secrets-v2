import { and, asc, desc, eq, ilike, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { schema, withTx, type Db } from '#lib/server/db/index.ts';
import {
	VideoHostError,
	type BunnyVideo,
	type Logger,
	type MediaStatus,
	type UploadTicket,
	type VideoHost
} from '#lib/server/platform/index.ts';
import { DomainError } from '../errors.ts';

const { media_assets, lessons } = schema;

export type MediaAsset = typeof media_assets.$inferSelect;

/** An asset plus the first lesson that plays it (the admin's “linked to lesson X” badge). */
export interface MediaListItem extends MediaAsset {
	linkedLessonId: string | null;
}

/** Upload tickets last two hours: long enough for a large file over a slow connection. */
export const UPLOAD_TICKET_TTL_SECONDS = 7200;

export interface MediaService {
	/** One page of the Bunny library, each video upserted into `media_assets`. */
	importFromLibrary(params: {
		page: number;
		perPage: number;
		search?: string;
	}): Promise<{ items: MediaListItem[]; total: number }>;
	/** Refreshes one asset from Bunny; null when no asset holds that video. */
	syncAsset(videoId: string): Promise<MediaAsset | null>;
	/** Cron entry point: re-syncs every `uploading|processing` asset older than the threshold. */
	syncProcessing(params: {
		olderThanMinutes: number;
	}): Promise<{ synced: number; failedAssetIds: string[] }>;
	createUpload(params: { title: string }): Promise<{ asset: MediaAsset; ticket: UploadTicket }>;
	/** A fresh ticket for resuming an interrupted upload. */
	reissueTicket(assetId: string): Promise<UploadTicket>;
	handleWebhook(params: { videoGuid: string }): Promise<MediaAsset | null>;
	list(params?: { status?: MediaStatus; search?: string }): Promise<MediaListItem[]>;
	get(id: string): Promise<MediaAsset | null>;
	/** Deletes the asset and its Bunny video; refuses with `MEDIA_IN_USE` while a lesson plays it. */
	remove(id: string): Promise<void>;
	setThumbnail(id: string, seconds: number): Promise<void>;
}

export interface CreateMediaServiceDeps {
	db: Db;
	videoHost: VideoHost;
	log: Logger;
}

/** The `media_assets` columns Bunny is the source of truth for. */
function fromBunny(video: BunnyVideo) {
	return {
		title: video.title,
		status: video.status,
		duration_seconds: video.lengthSeconds,
		width: video.width,
		height: video.height,
		thumbnail_url: video.thumbnailUrl
	};
}

export function createMediaService({ db, videoHost, log }: CreateMediaServiceDeps): MediaService {
	const libraryId = videoHost.libraryId;

	async function withLinkedLessons(assets: MediaAsset[]): Promise<MediaListItem[]> {
		if (assets.length === 0) return [];
		const links = await db
			.select({ assetId: lessons.media_asset_id, lessonId: lessons.id })
			.from(lessons)
			.where(
				inArray(
					lessons.media_asset_id,
					assets.map((asset) => asset.id)
				)
			)
			.orderBy(asc(lessons.created_at), asc(lessons.id));
		const linked = new Map<string, string>();
		for (const link of links) {
			if (link.assetId && !linked.has(link.assetId)) linked.set(link.assetId, link.lessonId);
		}
		return assets.map((asset) => ({ ...asset, linkedLessonId: linked.get(asset.id) ?? null }));
	}

	async function requireAsset(id: string): Promise<MediaAsset> {
		const [asset] = await db.select().from(media_assets).where(eq(media_assets.id, id)).limit(1);
		if (!asset) throw new DomainError('MEDIA_NOT_FOUND', 'Media asset not found');
		return asset;
	}

	async function syncAsset(videoId: string): Promise<MediaAsset | null> {
		const video = await videoHost.getVideo(videoId);
		const [asset] = await db
			.update(media_assets)
			.set({ ...fromBunny(video), updated_at: sql`now()` })
			.where(and(eq(media_assets.library_id, libraryId), eq(media_assets.video_id, videoId)))
			.returning();
		return asset ?? null;
	}

	return {
		async importFromLibrary({ page, perPage, search }) {
			const { items, total } = await videoHost.listVideos({ page, perPage, search });
			if (items.length === 0) return { items: [], total };

			// One statement, so the page is upserted atomically.
			const rows = await db
				.insert(media_assets)
				.values(
					items.map((video) => ({
						library_id: libraryId,
						video_id: video.videoId,
						...fromBunny(video)
					}))
				)
				.onConflictDoUpdate({
					target: [media_assets.library_id, media_assets.video_id],
					set: {
						title: sql`excluded.title`,
						status: sql`excluded.status`,
						duration_seconds: sql`excluded.duration_seconds`,
						width: sql`excluded.width`,
						height: sql`excluded.height`,
						thumbnail_url: sql`excluded.thumbnail_url`,
						updated_at: sql`now()`
					}
				})
				.returning();

			// Keep Bunny's order (newest first) for the library browser.
			const byVideoId = new Map(rows.map((row) => [row.video_id, row]));
			const ordered = items.flatMap((video) => byVideoId.get(video.videoId) ?? []);
			log.info('media library page imported', { page, count: ordered.length });
			return { items: await withLinkedLessons(ordered), total };
		},

		syncAsset,

		async syncProcessing({ olderThanMinutes }) {
			const stale = await db
				.select({ id: media_assets.id, videoId: media_assets.video_id })
				.from(media_assets)
				.where(
					and(
						eq(media_assets.library_id, libraryId),
						inArray(media_assets.status, ['uploading', 'processing']),
						lt(media_assets.updated_at, sql`now() - make_interval(mins => ${olderThanMinutes})`)
					)
				)
				.orderBy(asc(media_assets.updated_at));

			let synced = 0;
			const failedAssetIds: string[] = [];
			// One unreachable video must not stop the rest of the batch; failures
			// are logged and returned so the cron run reports them.
			for (const asset of stale) {
				try {
					await syncAsset(asset.videoId);
					synced += 1;
				} catch (err) {
					failedAssetIds.push(asset.id);
					log.warn('media sync failed', {
						assetId: asset.id,
						error: err instanceof Error ? err.message : String(err)
					});
				}
			}
			return { synced, failedAssetIds };
		},

		async createUpload({ title }) {
			const { videoId } = await videoHost.createVideo(title);
			const [asset] = await db
				.insert(media_assets)
				.values({ library_id: libraryId, video_id: videoId, title, status: 'uploading' })
				.returning();
			const ticket = await videoHost.uploadTicket(videoId, UPLOAD_TICKET_TTL_SECONDS);
			log.info('media upload created', { assetId: asset.id });
			return { asset, ticket };
		},

		async reissueTicket(assetId) {
			const asset = await requireAsset(assetId);
			return videoHost.uploadTicket(asset.video_id, UPLOAD_TICKET_TTL_SECONDS);
		},

		// Bunny's webhook carries a status, but the payload is unsigned and may
		// arrive out of order or be replayed. It is only a hint that something
		// changed: the asset is re-read from the Bunny API, which is the truth.
		handleWebhook: ({ videoGuid }) => syncAsset(videoGuid),

		async list({ status, search } = {}) {
			const filters: SQL[] = [];
			if (status) filters.push(eq(media_assets.status, status));
			if (search) filters.push(ilike(media_assets.title, `%${search}%`));
			const assets = await db
				.select()
				.from(media_assets)
				.where(and(...filters))
				.orderBy(desc(media_assets.created_at), asc(media_assets.id));
			return withLinkedLessons(assets);
		},

		async get(id) {
			const [asset] = await db.select().from(media_assets).where(eq(media_assets.id, id)).limit(1);
			return asset ?? null;
		},

		async remove(id) {
			const asset = await withTx(db, async (tx) => {
				const [row] = await tx
					.select()
					.from(media_assets)
					.where(eq(media_assets.id, id))
					.for('update');
				if (!row) throw new DomainError('MEDIA_NOT_FOUND', 'Media asset not found');
				const [lesson] = await tx
					.select({ id: lessons.id })
					.from(lessons)
					.where(eq(lessons.media_asset_id, id))
					.limit(1);
				if (lesson) {
					throw new DomainError('MEDIA_IN_USE', 'This video is used by a lesson; unlink it first');
				}
				await tx.delete(media_assets).where(eq(media_assets.id, id));
				return row;
			});

			try {
				await videoHost.deleteVideo(asset.video_id);
			} catch (err) {
				// Already deleted in the Bunny dashboard: the row is gone too, nothing left to do.
				if (!(err instanceof VideoHostError && err.status === 404)) throw err;
			}
			log.info('media asset removed', { assetId: id });
		},

		async setThumbnail(id, seconds) {
			const asset = await requireAsset(id);
			await videoHost.setThumbnail(asset.video_id, seconds);
		}
	};
}
