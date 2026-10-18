import type { RequestEvent } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { GET as expireOrders } from '../../src/routes/api/jobs/expire-orders/+server.ts';
import { GET as syncMedia } from '../../src/routes/api/jobs/sync-media/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { TEST_CRON_SECRET } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { orders, media_assets } = schema;

/** Both endpoints, under one signature so a test can take either. */
type Handler = (event: RequestEvent) => Promise<Response>;

describe('/api/jobs/*', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
	});

	async function get(handler: Handler, path: string, authorization?: string) {
		const event = fakeEvent({
			method: 'GET',
			url: path,
			headers: authorization ? { authorization } : {},
			locals: { services: seeded.services, requestId: 'req-1' }
		});
		const response = await handler(event as unknown as RequestEvent);
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	}

	const cases: Array<[string, Handler, string]> = [
		['expire-orders', expireOrders as unknown as Handler, '/api/jobs/expire-orders'],
		['sync-media', syncMedia as unknown as Handler, '/api/jobs/sync-media']
	];

	it.each(cases)('%s answers 401 without the cron secret', async (_name, handler, path) => {
		for (const header of [
			undefined,
			'Bearer wrong',
			`Basic ${TEST_CRON_SECRET}`,
			TEST_CRON_SECRET
		]) {
			expect(await get(handler, path, header)).toEqual({
				status: 401,
				body: { error: 'Unauthorized' }
			});
		}
	});

	it('expire-orders expires pending orders past their deadline and reports the count', async () => {
		const buyer = seeded.users.nobody;
		const { orders: orderService } = seeded.services.commerce;
		const stale = await orderService.createPendingOrder({
			userId: buyer.id,
			state: { items: [seeded.bundle.id], promoCode: null },
			viewer: { id: buyer.id }
		});
		const fresh = await orderService.createPendingOrder({
			userId: buyer.id,
			state: { items: [seeded.single.id], promoCode: null },
			viewer: { id: buyer.id }
		});
		await db()
			.update(orders)
			.set({ expires_at: sql`now() - interval '1 minute'` })
			.where(eq(orders.id, stale.id));

		const result = await get(
			expireOrders as unknown as Handler,
			'/api/jobs/expire-orders',
			`Bearer ${TEST_CRON_SECRET}`
		);

		expect(result).toEqual({ status: 200, body: { expired: 1 } });
		const statuses = Object.fromEntries(
			(await db().select().from(orders)).map((row) => [row.id, row.status])
		);
		expect(statuses).toEqual({ [stale.id]: 'expired', [fresh.id]: 'pending' });
	});

	it('sync-media re-syncs stale processing assets and reports the counts', async () => {
		const { media, videoHost } = seeded.services;
		const stale = await media.createUpload({ title: 'Stale upload' });
		const fresh = await media.createUpload({ title: 'Fresh upload' });
		await db()
			.update(media_assets)
			.set({ updated_at: sql`now() - interval '45 minutes'` })
			.where(eq(media_assets.id, stale.asset.id));
		videoHost.finishEncoding(stale.asset.video_id);
		videoHost.finishEncoding(fresh.asset.video_id);

		const result = await get(
			syncMedia as unknown as Handler,
			'/api/jobs/sync-media',
			`Bearer ${TEST_CRON_SECRET}`
		);

		expect(result).toEqual({ status: 200, body: { synced: 1, failed: 0 } });
		const [staleRow] = await db()
			.select()
			.from(media_assets)
			.where(eq(media_assets.id, stale.asset.id));
		expect(staleRow.status).toBe('ready');
		const [freshRow] = await db()
			.select()
			.from(media_assets)
			.where(eq(media_assets.id, fresh.asset.id));
		expect(freshRow.status).toBe('uploading');
	});
});
