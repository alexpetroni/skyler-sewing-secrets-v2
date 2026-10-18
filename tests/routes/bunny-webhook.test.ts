import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import type { MediaAsset } from '../../src/lib/server/modules/media/index.ts';
import { VideoHostError } from '../../src/lib/server/platform/bunny.ts';
import { POST } from '../../src/routes/api/webhooks/bunny/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { media_assets, webhook_events } = schema;

type PostEvent = Parameters<typeof POST>[0];

describe('POST /api/webhooks/bunny', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let asset: MediaAsset;

	beforeEach(async () => {
		services = createTestServices(db());
		({ asset } = await services.media.createUpload({ title: 'Collars' }));
	});

	async function post(body: unknown, using: TestServices = services) {
		const event = fakeEvent({
			method: 'POST',
			url: '/api/webhooks/bunny',
			headers: { 'content-type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body),
			locals: { services: using, requestId: 'req-1' }
		});
		const response = await POST(event as unknown as PostEvent);
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	}

	async function storedAsset() {
		const [row] = await db().select().from(media_assets);
		return row;
	}

	it('answers 400 for another library and records nothing', async () => {
		services.videoHost.finishEncoding(asset.video_id);
		const result = await post({ VideoLibraryId: 999, VideoGuid: asset.video_id, Status: 4 });
		expect(result).toEqual({
			status: 400,
			body: { error: 'This webhook is for another Bunny library', code: 'WRONG_LIBRARY' }
		});
		expect(await db().select().from(webhook_events)).toEqual([]);
		expect((await storedAsset()).status).toBe('uploading');
	});

	it('answers 400 for a malformed body', async () => {
		expect((await post('not json')).status).toBe(400);
		expect((await post({ VideoLibraryId: 100, Status: 4 })).status).toBe(400);
		expect(await db().select().from(webhook_events)).toEqual([]);
	});

	it('syncs the asset from the host, not from the payload status', async () => {
		// The payload claims "finished" (4), but Bunny's API still says processing.
		services.videoHost.videos.set(asset.video_id, {
			...services.videoHost.videos.get(asset.video_id)!,
			status: 'processing'
		});
		const claimedReady = await post({ VideoLibraryId: 100, VideoGuid: asset.video_id, Status: 4 });
		expect(claimedReady).toEqual({ status: 200, body: { received: true } });
		expect((await storedAsset()).status).toBe('processing');

		// The payload claims "encoding" (3) after the host finished: the host wins again.
		services.videoHost.finishEncoding(asset.video_id, { lengthSeconds: 845 });
		const claimedEncoding = await post({
			VideoLibraryId: '100',
			VideoGuid: asset.video_id,
			Status: 3
		});
		expect(claimedEncoding.status).toBe(200);
		expect(await storedAsset()).toMatchObject({
			status: 'ready',
			duration_seconds: 845,
			thumbnail_url: `https://fake.b-cdn.net/${asset.video_id}/thumbnail.jpg`
		});

		const events = await db().select().from(webhook_events).orderBy(webhook_events.event_id);
		expect(events.map((event) => [event.provider, event.event_id, event.type])).toEqual([
			['bunny', `${asset.video_id}:3`, 'video.status.3'],
			['bunny', `${asset.video_id}:4`, 'video.status.4']
		]);
		expect(events.every((event) => event.processed_at !== null)).toBe(true);
	});

	it('still answers 200 to a repeated delivery and syncs it again', async () => {
		const payload = { VideoLibraryId: 100, VideoGuid: asset.video_id, Status: 4 };
		expect((await post(payload)).status).toBe(200);
		expect((await storedAsset()).status).toBe('uploading');

		services.videoHost.finishEncoding(asset.video_id);
		const repeated = await post(payload);
		expect(repeated).toEqual({ status: 200, body: { received: true } });
		expect((await storedAsset()).status).toBe('ready');
		expect(await db().select().from(webhook_events)).toHaveLength(1);
		expect(
			services.logEntries.some(
				(entry) => entry.message === 'bunny webhook repeated' && entry.fields.status === 4
			)
		).toBe(true);
	});

	it('answers 500 and records the error when Bunny cannot be reached, so it is retried', async () => {
		const failing: TestServices = createTestServices(db(), {
			videoHost: Object.assign(services.videoHost, {
				getVideo: async () => {
					throw new VideoHostError('Bunny API 503', 503);
				}
			})
		});
		const result = await post(
			{ VideoLibraryId: 100, VideoGuid: asset.video_id, Status: 4 },
			failing
		);
		expect(result).toEqual({ status: 500, body: { error: 'Webhook handling failed' } });
		const [event] = await db().select().from(webhook_events);
		expect(event).toMatchObject({ error: 'Bunny API 503', processed_at: null });
	});
});
