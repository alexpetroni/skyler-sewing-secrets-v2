import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { createFakeVideoHost } from '../../src/lib/server/platform/fakes/video-host.ts';
import { load } from '../../src/routes/(marketing)/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { media_assets, testimonials } = schema;

type LoadEvent = Parameters<typeof load>[0];
/** `load` is typed to allow `void`; this load always returns its page data. */
type HomeData = import('../../src/routes/(marketing)/$types').PageServerData;

/** Fixed clock for the fake video host, so the signed URL is predictable. */
const NOW_MS = Date.parse('2026-10-18T12:00:00.000Z');
const EMBED_KEY = 'home-embed-key';

describe('/ load', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let services: TestServices;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		services = createTestServices(db(), {
			videoHost: createFakeVideoHost({ embedTokenKey: EMBED_KEY, now: () => NOW_MS })
		});
	});

	function run(locals: Partial<App.Locals> = {}) {
		const event = fakeEvent({ url: '/', locals: { services, maintenanceMode: false, ...locals } });
		return load(event as unknown as LoadEvent) as Promise<HomeData>;
	}

	async function asset(videoId: string, durationSeconds: number): Promise<string> {
		const [row] = await db()
			.insert(media_assets)
			.values({
				library_id: '100',
				video_id: videoId,
				status: 'ready',
				duration_seconds: durationSeconds
			})
			.returning();
		return row.id;
	}

	async function lesson(
		slug: string,
		overrides: {
			kind?: 'video' | 'article';
			isFreePreview?: boolean;
			isPublished?: boolean;
			mediaAssetId?: string | null;
		}
	) {
		return services.content.lessons.create({
			moduleId: seeded.moduleId,
			title: slug,
			slug,
			kind: overrides.kind ?? 'video',
			mediaAssetId: overrides.mediaAssetId ?? null,
			description: `About ${slug}`,
			contentMd: '',
			isFreePreview: overrides.isFreePreview ?? false,
			isPublished: overrides.isPublished ?? true,
			orderIndex: 5
		});
	}

	it('returns outline totals computed from the published lessons', async () => {
		// Seeded: two published 600 s course videos and one standalone video (not in the outline).
		await lesson('preview-lesson', {
			isFreePreview: true,
			mediaAssetId: await asset('preview-video', 300)
		});
		await lesson('draft-lesson', {
			isPublished: false,
			mediaAssetId: await asset('draft-video', 3000)
		});
		const bonus = await services.content.modules.create({
			title: 'Chanel Skirt',
			slug: 'chanel-skirt',
			description: 'The bonus project',
			thumbnailUrl: '',
			orderIndex: 1,
			isPublished: true,
			isBonus: true,
			isCourseContent: true
		});
		await services.content.lessons.create({
			moduleId: bonus.id,
			title: 'Skirt',
			slug: 'skirt',
			kind: 'video',
			mediaAssetId: await asset('skirt-video', 1500),
			description: '',
			contentMd: '',
			isFreePreview: false,
			isPublished: true,
			orderIndex: 0
		});

		const data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');

		expect(data.outline.totals).toEqual({ modules: 1, bonusModules: 1, videos: 4, minutes: 50 });
		expect(data.outline.modules.map((m) => [m.slug, m.lessons.length])).toEqual([
			['basics', 3],
			['chanel-skirt', 1]
		]);
	});

	it('returns the published flagship with its effective price', async () => {
		const data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');

		expect(data.flagship).toMatchObject({
			id: seeded.flagship.id,
			slug: 'the-course',
			access_scope: 'all',
			pricing: { listPrice: 14900, price: 14900, onSale: false }
		});
	});

	it('returns no flagship while the course product is unpublished', async () => {
		await services.catalog.unpublish(seeded.flagship.id);

		const data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');

		expect(data.flagship).toBeNull();
	});

	it('signs an embed URL for the free-preview lesson', async () => {
		await lesson('mitred-corner', {
			isFreePreview: true,
			mediaAssetId: await asset('preview-video', 300)
		});

		const data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');

		const expires = NOW_MS / 1000 + 6 * 60 * 60;
		const token = createHash('sha256').update(`${EMBED_KEY}preview-video${expires}`).digest('hex');
		expect(data.freePreview).toEqual({
			title: 'mitred-corner',
			description: 'About mitred-corner',
			embedUrl: `https://iframe.mediadelivery.net/embed/100/preview-video?autoplay=false&preload=true&token=${token}&expires=${expires}`
		});
	});

	it('has no preview without a flagged lesson and a null embed URL for an article preview', async () => {
		let data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');
		expect(data.freePreview).toBeNull();

		// Only an article can be published without a ready video.
		await lesson('preview-without-video', { kind: 'article', isFreePreview: true });
		data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');
		expect(data.freePreview).toEqual({
			title: 'preview-without-video',
			description: 'About preview-without-video',
			embedUrl: null
		});
	});

	it('returns up to six published featured testimonials in order', async () => {
		await db()
			.insert(testimonials)
			.values([
				...Array.from({ length: 7 }, (_, i) => ({
					author_name: `Featured ${i}`,
					content: 'Lovely course',
					is_featured: true,
					is_published: true,
					order_index: 7 - i
				})),
				{ author_name: 'Not featured', content: 'Fine', is_published: true },
				{ author_name: 'Draft', content: 'Hidden', is_featured: true, is_published: false }
			]);

		const data = await run();
		if (data.maintenance) throw new Error('expected the homepage data');

		expect(data.testimonials.map((t) => t.author_name)).toEqual([
			'Featured 6',
			'Featured 5',
			'Featured 4',
			'Featured 3',
			'Featured 2',
			'Featured 1'
		]);
	});

	it('returns only the maintenance flag while maintenance mode is on', async () => {
		expect(await run({ maintenanceMode: true })).toEqual({ maintenance: true });
	});
});
