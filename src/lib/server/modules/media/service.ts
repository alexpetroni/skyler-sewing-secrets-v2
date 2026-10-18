import { and, asc, desc, eq, ilike, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import {
	VideoHostError,
	type BunnyVideo,
	type Logger,
	type MediaStatus,
	type UploadTicket,
	type VideoHost
} from '#lib/server/platform/index.ts';
import { DomainError } from '../errors.ts';

const { media_assets, lessons, audit_log, webhook_events } = schema;

export type MediaAsset = typeof media_assets.$inferSelect;

/** An asset plus the first lesson that plays it (the admin's “linked to lesson X” badge). */
export interface MediaListItem extends MediaAsset {
	linkedLessonId: string | null;
}

/** A Bunny library video and the asset that imported it, if any (the import browser). */
export interface LibraryVideo extends BunnyVideo {
	assetId: string | null;
}

/** What Bunny posts to the webhook: `{ VideoLibraryId, VideoGuid, Status }`. */
export interface BunnyWebhookInput {
	libraryId: string;
	videoGuid: string;
	status: number;
}

export interface WebhookResult {
	/** The asset as re-read from Bunny; null when no asset holds that video. */
	asset: MediaAsset | null;
	/** The same `(guid, status)` was delivered before; it was synced again anyway. */
	duplicate: boolean;
}

/** Upload tickets last two hours: long enough for a large file over a slow connection. */
export const UPLOAD_TICKET_TTL_SECONDS = 7200;

// Mutations take the acting admin (`actorId`); when given, the change is
// written to `audit_log` in the same transaction as the row it describes.
export interface MediaService {
	/** One page of the Bunny library, each video upserted into `media_assets`. */
	importFromLibrary(params: {
		page: number;
		perPage: number;
		search?: string;
		actorId?: string;
	}): Promise<{ items: MediaListItem[]; total: number }>;
	/** One page of the Bunny library, read only, marking the videos already imported. */
	browseLibrary(params: {
		page: number;
		perPage: number;
		search?: string;
	}): Promise<{ items: LibraryVideo[]; total: number }>;
	/** Imports (or refreshes) one Bunny video into `media_assets`. */
	importVideo(videoId: string, actorId?: string): Promise<MediaAsset>;
	/** Refreshes one asset from Bunny; null when no asset holds that video. */
	syncAsset(videoId: string): Promise<MediaAsset | null>;
	/** Cron entry point: re-syncs every `uploading|processing` asset older than the threshold. */
	syncProcessing(params: {
		olderThanMinutes: number;
		actorId?: string;
	}): Promise<{ synced: number; failedAssetIds: string[] }>;
	createUpload(params: {
		title: string;
		actorId?: string;
	}): Promise<{ asset: MediaAsset; ticket: UploadTicket }>;
	/** A fresh ticket for resuming an interrupted upload. */
	reissueTicket(assetId: string): Promise<UploadTicket>;
	handleWebhook(params: { videoGuid: string }): Promise<MediaAsset | null>;
	/**
	 * The Bunny webhook: refuses another library (`WRONG_LIBRARY`), records the
	 * delivery in `webhook_events` and re-syncs the asset from the API. The
	 * payload status is only part of the dedupe key, never stored.
	 */
	receiveWebhook(input: BunnyWebhookInput): Promise<WebhookResult>;
	list(params?: { status?: MediaStatus; search?: string }): Promise<MediaListItem[]>;
	get(id: string): Promise<MediaAsset | null>;
	/** One asset with the lesson that plays it; null when missing. */
	detail(id: string): Promise<MediaListItem | null>;
	/** Deletes the asset and its Bunny video; refuses with `MEDIA_IN_USE` while a lesson plays it. */
	remove(id: string, actorId?: string): Promise<void>;
	setThumbnail(id: string, seconds: number, actorId?: string): Promise<void>;
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

interface AuditEntry {
	action: string;
	entityId: string | null;
	before?: unknown;
	after?: unknown;
}

export function createMediaService({ db, videoHost, log }: CreateMediaServiceDeps): MediaService {
	const libraryId = videoHost.libraryId;

	async function writeAudit(executor: Db | Tx, actorId: string | undefined, entry: AuditEntry) {
		if (!actorId) return;
		await executor.insert(audit_log).values({
			actor_id: actorId,
			action: entry.action,
			entity: 'media_asset',
			entity_id: entry.entityId,
			before: entry.before ?? null,
			after: entry.after ?? null
		});
	}

	function upsertVideos(executor: Db | Tx, videos: BunnyVideo[]) {
		return executor
			.insert(media_assets)
			.values(
				videos.map((video) => ({
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
	}

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
		async importFromLibrary({ page, perPage, search, actorId }) {
			const { items, total } = await videoHost.listVideos({ page, perPage, search });
			if (items.length === 0) return { items: [], total };

			// One statement, so the page is upserted atomically (with its audit rows).
			const rows = await withTx(db, async (tx) => {
				const upserted = await upsertVideos(tx, items);
				for (const row of upserted) {
					await writeAudit(tx, actorId, {
						action: 'media.import',
						entityId: row.id,
						after: { video_id: row.video_id, status: row.status }
					});
				}
				return upserted;
			});

			// Keep Bunny's order (newest first) for the library browser.
			const byVideoId = new Map(rows.map((row) => [row.video_id, row]));
			const ordered = items.flatMap((video) => byVideoId.get(video.videoId) ?? []);
			log.info('media library page imported', { page, count: ordered.length });
			return { items: await withLinkedLessons(ordered), total };
		},

		async browseLibrary({ page, perPage, search }) {
			const { items, total } = await videoHost.listVideos({ page, perPage, search });
			if (items.length === 0) return { items: [], total };
			const known = await db
				.select({ id: media_assets.id, videoId: media_assets.video_id })
				.from(media_assets)
				.where(
					and(
						eq(media_assets.library_id, libraryId),
						inArray(
							media_assets.video_id,
							items.map((video) => video.videoId)
						)
					)
				);
			const assetIds = new Map(known.map((row) => [row.videoId, row.id]));
			return {
				items: items.map((video) => ({ ...video, assetId: assetIds.get(video.videoId) ?? null })),
				total
			};
		},

		async importVideo(videoId, actorId) {
			const video = await videoHost.getVideo(videoId);
			return withTx(db, async (tx) => {
				const [asset] = await upsertVideos(tx, [video]);
				await writeAudit(tx, actorId, {
					action: 'media.import',
					entityId: asset.id,
					after: { video_id: asset.video_id, status: asset.status }
				});
				log.info('media video imported', { assetId: asset.id });
				return asset;
			});
		},

		syncAsset,

		async syncProcessing({ olderThanMinutes, actorId }) {
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
			await writeAudit(db, actorId, {
				action: 'media.sync',
				entityId: null,
				after: { synced, failed: failedAssetIds.length }
			});
			return { synced, failedAssetIds };
		},

		async createUpload({ title, actorId }) {
			const { videoId } = await videoHost.createVideo(title);
			const asset = await withTx(db, async (tx) => {
				const [row] = await tx
					.insert(media_assets)
					.values({ library_id: libraryId, video_id: videoId, title, status: 'uploading' })
					.returning();
				await writeAudit(tx, actorId, {
					action: 'media.upload',
					entityId: row.id,
					after: { video_id: videoId, title }
				});
				return row;
			});
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

		async receiveWebhook({ libraryId: payloadLibraryId, videoGuid, status }) {
			if (payloadLibraryId !== libraryId) {
				throw new DomainError('WRONG_LIBRARY', 'This webhook is for another Bunny library');
			}
			const eventId = `${videoGuid}:${status}`;
			const inserted = await db
				.insert(webhook_events)
				.values({
					provider: 'bunny',
					event_id: eventId,
					type: `video.status.${status}`,
					reference: videoGuid
				})
				.onConflictDoNothing({ target: [webhook_events.provider, webhook_events.event_id] })
				.returning({ id: webhook_events.id });
			const duplicate = inserted.length === 0;
			// Duplicates are synced too: the sync re-reads Bunny, so repeating it is harmless.
			const recorded = and(
				eq(webhook_events.provider, 'bunny'),
				eq(webhook_events.event_id, eventId)
			);
			let asset: MediaAsset | null;
			try {
				asset = await syncAsset(videoGuid);
			} catch (err) {
				if (err instanceof VideoHostError && err.status === 404) {
					// Deleted in Bunny before the delivery arrived: nothing left to sync.
					asset = null;
				} else {
					const message = err instanceof Error ? err.message : String(err);
					await db.update(webhook_events).set({ error: message }).where(recorded);
					throw err;
				}
			}
			await db
				.update(webhook_events)
				.set({ processed_at: sql`now()`, error: null })
				.where(recorded);
			return { asset, duplicate };
		},

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

		async detail(id) {
			const [asset] = await db.select().from(media_assets).where(eq(media_assets.id, id)).limit(1);
			if (!asset) return null;
			const [item] = await withLinkedLessons([asset]);
			return item;
		},

		async remove(id, actorId) {
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
				await writeAudit(tx, actorId, { action: 'media.delete', entityId: id, before: row });
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

		async setThumbnail(id, seconds, actorId) {
			const asset = await requireAsset(id);
			await videoHost.setThumbnail(asset.video_id, seconds);
			// Bunny holds the thumbnail; the only row written is the audit entry.
			await writeAudit(db, actorId, {
				action: 'media.set_thumbnail',
				entityId: id,
				after: { thumbnail_time: seconds }
			});
		}
	};
}
