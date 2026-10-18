import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createTestServices } from '../../../../../tests/helpers/services.ts';
import { schema } from '#lib/server/db/index.ts';
import { createFakeVideoHost } from '#lib/server/platform/fakes/video-host.ts';
import { DomainError } from '../errors.ts';
import { UPLOAD_TICKET_TTL_SECONDS } from './service.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { media_assets, modules, lessons } = schema;

describe('createMediaService', () => {
	const { db } = useTestDb();
	const setup = () => createTestServices(db());

	async function insertLesson(mediaAssetId: string, slug = 'pinning'): Promise<string> {
		const [module] = await db()
			.insert(modules)
			.values({ title: 'Basics', slug: `basics-${slug}` })
			.returning();
		const [lesson] = await db()
			.insert(lessons)
			.values({ module_id: module.id, title: 'Pinning', slug, media_asset_id: mediaAssetId })
			.returning();
		return lesson.id;
	}

	async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
		const err = await promise.then(
			() => null,
			(error: unknown) => error
		);
		expect(err).toBeInstanceOf(DomainError);
		expect((err as DomainError).code).toBe(code);
	}

	describe('importFromLibrary', () => {
		it('upserts the page into media_assets and reports the linked lesson', async () => {
			const { media, videoHost } = setup();
			const { videoId: first } = await videoHost.createVideo('French seams');
			const { videoId: second } = await videoHost.createVideo('Pin hems');
			videoHost.finishEncoding(first, { lengthSeconds: 312 });

			const imported = await media.importFromLibrary({ page: 1, perPage: 10 });

			expect(imported.total).toBe(2);
			// Bunny's order (newest first) is kept.
			expect(imported.items.map((item) => item.video_id)).toEqual([second, first]);
			const firstAsset = imported.items[1];
			expect(firstAsset).toMatchObject({
				library_id: videoHost.libraryId,
				video_id: first,
				title: 'French seams',
				status: 'ready',
				duration_seconds: 312,
				width: 1920,
				height: 1080,
				thumbnail_url: `https://fake.b-cdn.net/${first}/thumbnail.jpg`,
				linkedLessonId: null
			});
			expect(imported.items[0]).toMatchObject({ status: 'uploading', linkedLessonId: null });

			const lessonId = await insertLesson(firstAsset.id);
			videoHost.finishEncoding(second, { title: 'Pin hems (final)' });

			const again = await media.importFromLibrary({ page: 1, perPage: 10 });

			// Same rows (no duplicates), refreshed from Bunny, with the link.
			const rows = await db().select().from(media_assets);
			expect(rows).toHaveLength(2);
			expect(again.items.map((item) => item.id)).toEqual(imported.items.map((item) => item.id));
			expect(again.items[1].linkedLessonId).toBe(lessonId);
			expect(again.items[0]).toMatchObject({
				title: 'Pin hems (final)',
				status: 'ready',
				linkedLessonId: null
			});
		});

		it('passes paging and search to the video host', async () => {
			const { media, videoHost } = setup();
			await videoHost.createVideo('Zip basics');
			await videoHost.createVideo('Seam allowance');
			await videoHost.createVideo('Zip covered');

			const page = await media.importFromLibrary({ page: 2, perPage: 1, search: 'zip' });

			expect(page.total).toBe(2);
			expect(page.items.map((item) => item.title)).toEqual(['Zip basics']);
			expect(await db().select().from(media_assets)).toHaveLength(1);
		});
	});

	describe('createUpload', () => {
		it('creates the Bunny video, an uploading asset and a two-hour TUS ticket', async () => {
			const now = Date.UTC(2026, 9, 18, 12, 0, 0);
			const videoHost = createFakeVideoHost({ now: () => now });
			const { media } = createTestServices(db(), { videoHost });

			const { asset, ticket } = await media.createUpload({ title: 'Bias binding' });

			const [bunnyVideo] = [...videoHost.videos.values()];
			expect(bunnyVideo.title).toBe('Bias binding');
			expect(asset).toMatchObject({
				library_id: videoHost.libraryId,
				video_id: bunnyVideo.videoId,
				title: 'Bias binding',
				status: 'uploading'
			});
			const [row] = await db().select().from(media_assets).where(eq(media_assets.id, asset.id));
			expect(row.status).toBe('uploading');
			expect(ticket).toEqual(
				await videoHost.uploadTicket(bunnyVideo.videoId, UPLOAD_TICKET_TTL_SECONDS)
			);
			expect(ticket.expiresAt).toBe(now / 1000 + 7200);
		});

		it('reissues a ticket for the same video when an upload resumes', async () => {
			const { media } = setup();
			const { asset } = await media.createUpload({ title: 'Bias binding' });

			const ticket = await media.reissueTicket(asset.id);

			expect(ticket.videoId).toBe(asset.video_id);
			expect(ticket.headers.VideoId).toBe(asset.video_id);
			await expectDomainError(media.reissueTicket(crypto.randomUUID()), 'MEDIA_NOT_FOUND');
		});
	});

	describe('handleWebhook', () => {
		it('syncs the asset from the video host, ignoring any payload status', async () => {
			const { media, videoHost } = setup();
			const { asset } = await media.createUpload({ title: 'Collars' });
			// Bunny still reports processing even though a webhook claimed "finished".
			videoHost.videos.set(asset.video_id, {
				...videoHost.videos.get(asset.video_id)!,
				status: 'processing'
			});

			const processing = await media.handleWebhook({ videoGuid: asset.video_id });
			expect(processing?.status).toBe('processing');

			videoHost.finishEncoding(asset.video_id, { lengthSeconds: 845, width: 1280, height: 720 });
			const ready = await media.handleWebhook({ videoGuid: asset.video_id });

			expect(ready).toMatchObject({
				id: asset.id,
				status: 'ready',
				duration_seconds: 845,
				width: 1280,
				height: 720,
				thumbnail_url: `https://fake.b-cdn.net/${asset.video_id}/thumbnail.jpg`
			});
			const [row] = await db().select().from(media_assets).where(eq(media_assets.id, asset.id));
			expect(row.status).toBe('ready');
		});

		it('returns null for a video that has no asset', async () => {
			const { media, videoHost } = setup();
			const { videoId } = await videoHost.createVideo('Uploaded in the dashboard');

			expect(await media.handleWebhook({ videoGuid: videoId })).toBeNull();
			expect(await db().select().from(media_assets)).toHaveLength(0);
		});
	});

	describe('syncProcessing', () => {
		it('re-syncs only uploading/processing assets older than the threshold', async () => {
			const { media, videoHost } = setup();
			const stale = await media.createUpload({ title: 'Stale' });
			const fresh = await media.createUpload({ title: 'Fresh' });
			const done = await media.createUpload({ title: 'Done' });
			await db()
				.update(media_assets)
				.set({ updated_at: sql`now() - interval '45 minutes'` })
				.where(eq(media_assets.id, stale.asset.id));
			await db()
				.update(media_assets)
				.set({ status: 'ready', updated_at: sql`now() - interval '45 minutes'` })
				.where(eq(media_assets.id, done.asset.id));
			for (const { asset } of [stale, fresh, done]) videoHost.finishEncoding(asset.video_id);

			const result = await media.syncProcessing({ olderThanMinutes: 30 });

			expect(result).toEqual({ synced: 1, failedAssetIds: [] });
			const statuses = Object.fromEntries(
				(await db().select().from(media_assets)).map((row) => [row.title, row.status])
			);
			expect(statuses).toEqual({ Stale: 'ready', Fresh: 'uploading', Done: 'ready' });
		});

		it('keeps going when one video is gone from Bunny and reports it', async () => {
			const { media, videoHost, logEntries } = setup();
			const gone = await media.createUpload({ title: 'Gone' });
			const kept = await media.createUpload({ title: 'Kept' });
			await videoHost.deleteVideo(gone.asset.video_id);
			videoHost.finishEncoding(kept.asset.video_id);

			const result = await media.syncProcessing({ olderThanMinutes: 0 });

			expect(result).toEqual({ synced: 1, failedAssetIds: [gone.asset.id] });
			expect((await media.get(kept.asset.id))?.status).toBe('ready');
			expect(logEntries).toContainEqual(
				expect.objectContaining({
					level: 'warn',
					message: 'media sync failed',
					fields: expect.objectContaining({ assetId: gone.asset.id })
				})
			);
		});
	});

	describe('list and get', () => {
		it('filters by status and title search and reports linked lessons', async () => {
			const { media, videoHost } = setup();
			const a = await media.createUpload({ title: 'Zip covered' });
			await media.createUpload({ title: 'Zip exposed' });
			await media.createUpload({ title: 'Hems' });
			videoHost.finishEncoding(a.asset.video_id);
			await media.syncAsset(a.asset.video_id);
			const lessonId = await insertLesson(a.asset.id);

			const ready = await media.list({ status: 'ready' });
			expect(ready.map((item) => [item.title, item.linkedLessonId])).toEqual([
				['Zip covered', lessonId]
			]);
			const zips = await media.list({ search: 'ZIP' });
			expect(zips.map((item) => item.title).sort()).toEqual(['Zip covered', 'Zip exposed']);
			expect(await media.list()).toHaveLength(3);
			expect((await media.get(a.asset.id))?.title).toBe('Zip covered');
			expect(await media.get(crypto.randomUUID())).toBeNull();
		});
	});

	describe('remove', () => {
		it('refuses with MEDIA_IN_USE while a lesson references the asset', async () => {
			const { media, videoHost } = setup();
			const { asset } = await media.createUpload({ title: 'Linked' });
			await insertLesson(asset.id);

			await expectDomainError(media.remove(asset.id), 'MEDIA_IN_USE');

			expect(await media.get(asset.id)).not.toBeNull();
			expect(videoHost.videos.has(asset.video_id)).toBe(true);
		});

		it('deletes the asset and then the Bunny video when nothing references it', async () => {
			const { media, videoHost } = setup();
			const { asset } = await media.createUpload({ title: 'Unused' });

			await media.remove(asset.id);

			expect(await media.get(asset.id)).toBeNull();
			expect(videoHost.videos.has(asset.video_id)).toBe(false);
		});

		it('still removes the row when the video was already deleted in Bunny', async () => {
			const { media, videoHost } = setup();
			const { asset } = await media.createUpload({ title: 'Deleted in dashboard' });
			await videoHost.deleteVideo(asset.video_id);

			await media.remove(asset.id);

			expect(await media.get(asset.id)).toBeNull();
			await expectDomainError(media.remove(asset.id), 'MEDIA_NOT_FOUND');
		});
	});

	describe('setThumbnail', () => {
		it('asks Bunny to use the frame at the given second', async () => {
			const { media, videoHost } = setup();
			const { asset } = await media.createUpload({ title: 'Thumb' });

			await media.setThumbnail(asset.id, 42);

			expect(videoHost.thumbnailTimes.get(asset.video_id)).toBe(42);
			await expectDomainError(media.setThumbnail(crypto.randomUUID(), 1), 'MEDIA_NOT_FOUND');
		});
	});
});
