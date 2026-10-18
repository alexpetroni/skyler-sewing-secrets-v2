import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	createBunnyVideoHost,
	mapBunnyStatus,
	parseBunnyRef,
	TUS_ENDPOINT,
	VideoHostError,
	type BunnyVideoHostOptions
} from './bunny.ts';
import { createFakeVideoHost } from './fakes/video-host.ts';

// Ported from legacy/src/lib/server/bunny.signed.test.ts: same key, time and ttl.
const FIXED_TIME = new Date('2026-09-06T12:00:00.000Z');
const TTL_SECONDS = 60;
const FIXED_EXPIRES = Math.floor(FIXED_TIME.getTime() / 1000) + TTL_SECONDS;

interface RecordedCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | undefined;
}

/** A `fetch` stand-in: records each call and answers with the queued responses. */
function stubFetch(...responses: Array<() => Response>) {
	const calls: RecordedCall[] = [];
	const fetchStub: typeof fetch = async (input, init) => {
		calls.push({
			url: String(input),
			method: init?.method ?? 'GET',
			headers: Object.fromEntries(new Headers(init?.headers).entries()),
			body: typeof init?.body === 'string' ? init.body : undefined
		});
		const next = responses.shift();
		if (!next) throw new Error('stubFetch: no response queued');
		return next();
	};
	return { fetch: fetchStub, calls };
}

function host(overrides: Partial<BunnyVideoHostOptions> = {}) {
	return createBunnyVideoHost({
		libraryId: '123',
		apiKey: 'api-key',
		embedTokenKey: 'k',
		cdnHost: 'vz-test.b-cdn.net',
		fetch: stubFetch().fetch,
		now: () => FIXED_TIME.getTime(),
		...overrides
	});
}

const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

describe('parseBunnyRef (ported from legacy/src/lib/types/bunny.test.ts)', () => {
	it('parses a bunny:{libraryId}/{videoId} reference', () => {
		expect(parseBunnyRef('bunny:123/abc-def')).toEqual({ libraryId: '123', videoId: 'abc-def' });
	});

	it('returns null for an https URL', () => {
		expect(parseBunnyRef('https://x')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(parseBunnyRef('')).toBeNull();
	});

	it('returns null when the library id is missing', () => {
		expect(parseBunnyRef('bunny:/abc')).toBeNull();
	});
});

describe('createBunnyVideoHost', () => {
	it('throws when embedTokenKey is empty (fail closed)', () => {
		expect(() => host({ embedTokenKey: '' })).toThrow(/embed token key is required/);
	});

	it('exposes the library it is bound to', () => {
		expect(host().libraryId).toBe('123');
	});
});

describe('embedUrl (ported from legacy bunny.test.ts and bunny.signed.test.ts)', () => {
	it('equals the legacy signed URL for a fixed clock', async () => {
		const url = await host().embedUrl({ libraryId: '123', videoId: 'abc' }, TTL_SECONDS);
		const token = sha256('k' + 'abc' + FIXED_EXPIRES);
		expect(url).toBe(
			`https://iframe.mediadelivery.net/embed/123/abc?autoplay=false&preload=true&token=${token}&expires=${FIXED_EXPIRES}`
		);
	});

	it('builds on the plain legacy embed URL, now always signed', async () => {
		const url = await host().embedUrl({ libraryId: '123', videoId: 'abc' });
		expect(
			url.startsWith('https://iframe.mediadelivery.net/embed/123/abc?autoplay=false&preload=true&')
		).toBe(true);
		expect(new URL(url).searchParams.get('token')).toMatch(/^[0-9a-f]{64}$/);
	});

	it('sets expires to the current time in seconds plus the ttl', async () => {
		const url = new URL(await host().embedUrl({ libraryId: '123', videoId: 'abc' }, TTL_SECONDS));
		expect(url.searchParams.get('expires')).toBe(String(FIXED_EXPIRES));
	});

	it('signs the token as SHA256_HEX(key + videoId + expires)', async () => {
		const url = new URL(await host().embedUrl({ libraryId: '123', videoId: 'abc' }, TTL_SECONDS));
		const token = url.searchParams.get('token');
		expect(token).toMatch(/^[0-9a-f]{64}$/);
		expect(token).toBe(sha256('k' + 'abc' + FIXED_EXPIRES));
	});

	it('defaults the ttl to six hours', async () => {
		const url = new URL(await host().embedUrl({ libraryId: '123', videoId: 'abc' }));
		expect(url.searchParams.get('expires')).toBe(
			String(Math.floor(FIXED_TIME.getTime() / 1000) + 6 * 60 * 60)
		);
	});
});

describe('uploadTicket', () => {
	it('signs AuthorizationSignature as sha256(lib + key + exp + id)', async () => {
		const ticket = await host().uploadTicket('vid-1', 7200);
		const expiresAt = Math.floor(FIXED_TIME.getTime() / 1000) + 7200;

		expect(ticket).toEqual({
			endpoint: TUS_ENDPOINT,
			videoId: 'vid-1',
			libraryId: '123',
			expiresAt,
			headers: {
				AuthorizationSignature: sha256('123' + 'api-key' + expiresAt + 'vid-1'),
				AuthorizationExpire: String(expiresAt),
				VideoId: 'vid-1',
				LibraryId: '123'
			}
		});
		expect(TUS_ENDPOINT).toBe('https://video.bunnycdn.com/tusupload');
	});
});

describe('Library API calls', () => {
	const fixture = readFileSync(
		new URL('./fixtures/bunny-list-videos.json', import.meta.url),
		'utf8'
	);

	it('listVideos maps a Bunny list response and sends AccessKey', async () => {
		const stub = stubFetch(() => new Response(fixture, { status: 200 }));
		const result = await host({ fetch: stub.fetch }).listVideos({
			page: 2,
			perPage: 2,
			search: 'skirt'
		});

		expect(stub.calls).toHaveLength(1);
		const [call] = stub.calls;
		const url = new URL(call.url);
		expect(url.origin + url.pathname).toBe('https://video.bunnycdn.com/library/123/videos');
		expect(Object.fromEntries(url.searchParams)).toEqual({
			page: '2',
			itemsPerPage: '2',
			orderBy: 'date',
			search: 'skirt'
		});
		expect(call.method).toBe('GET');
		expect(call.headers.accesskey).toBe('api-key');

		expect(result.total).toBe(42);
		expect(result.items).toEqual([
			{
				videoId: '4b2a8f0e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
				title: 'Chanel Skirt – Lining',
				lengthSeconds: 1834,
				status: 'ready',
				width: 1920,
				height: 1080,
				thumbnailUrl:
					'https://vz-test.b-cdn.net/4b2a8f0e-1c3d-4e5f-8a9b-0c1d2e3f4a5b/thumbnail.jpg',
				dateUploaded: '2026-09-06T12:00:00.123Z'
			},
			{
				videoId: '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a',
				title: 'Pressing Seams',
				lengthSeconds: 0,
				status: 'processing',
				width: null,
				height: null,
				thumbnailUrl: null,
				dateUploaded: '2026-10-17T08:15:00.000Z'
			}
		]);
	});

	it('listVideos omits search when none is given', async () => {
		const stub = stubFetch(() => new Response(fixture, { status: 200 }));
		await host({ fetch: stub.fetch }).listVideos({ page: 1, perPage: 50 });
		expect(new URL(stub.calls[0].url).searchParams.has('search')).toBe(false);
	});

	it('getVideo fetches one video and normalises it', async () => {
		const video = (JSON.parse(fixture) as { items: unknown[] }).items[0];
		const stub = stubFetch(() => Response.json(video));
		const result = await host({ fetch: stub.fetch }).getVideo(
			'4b2a8f0e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
		);

		expect(stub.calls[0].url).toBe(
			'https://video.bunnycdn.com/library/123/videos/4b2a8f0e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'
		);
		expect(result.status).toBe('ready');
		expect(result.lengthSeconds).toBe(1834);
	});

	it('createVideo posts the title and returns the guid', async () => {
		const stub = stubFetch(() => Response.json({ guid: 'new-guid', title: 'Hem', status: 0 }));
		const result = await host({ fetch: stub.fetch }).createVideo('Hem');

		expect(result).toEqual({ videoId: 'new-guid' });
		expect(stub.calls[0]).toMatchObject({
			url: 'https://video.bunnycdn.com/library/123/videos',
			method: 'POST',
			body: JSON.stringify({ title: 'Hem' })
		});
		expect(stub.calls[0].headers['content-type']).toBe('application/json');
	});

	it('setThumbnail and deleteVideo hit the video endpoints', async () => {
		const stub = stubFetch(
			() => Response.json({ success: true }),
			() => Response.json({ success: true })
		);
		const bunny = host({ fetch: stub.fetch });
		await bunny.setThumbnail('vid-1', 12000);
		await bunny.deleteVideo('vid-1');

		expect(stub.calls.map((call) => [call.method, call.url])).toEqual([
			['POST', 'https://video.bunnycdn.com/library/123/videos/vid-1/thumbnail?thumbnailTime=12000'],
			['DELETE', 'https://video.bunnycdn.com/library/123/videos/vid-1']
		]);
	});

	it('throws a VideoHostError carrying the status on a non-2xx answer', async () => {
		const stub = stubFetch(() => new Response('not found', { status: 404 }));
		const error = await host({ fetch: stub.fetch })
			.getVideo('missing')
			.catch((err: unknown) => err);
		expect(error).toBeInstanceOf(VideoHostError);
		expect((error as VideoHostError).status).toBe(404);
	});
});

describe('mapBunnyStatus', () => {
	it.each([
		[0, 'uploading'],
		[1, 'processing'],
		[2, 'processing'],
		[3, 'processing'],
		[4, 'ready'],
		[5, 'failed'],
		[6, 'failed']
	] as const)('maps Bunny status %i to %s', (status, expected) => {
		expect(mapBunnyStatus(status)).toBe(expected);
	});
});

describe('createFakeVideoHost', () => {
	it('creates videos with deterministic ids and finishes their encoding', async () => {
		const fake = createFakeVideoHost();
		const first = await fake.createVideo('Hem');
		const second = await fake.createVideo('Darts');
		expect([first.videoId, second.videoId]).toEqual(['fake-video-0001', 'fake-video-0002']);
		expect((await fake.getVideo(first.videoId)).status).toBe('uploading');

		fake.finishEncoding(first.videoId, { lengthSeconds: 90 });
		const ready = await fake.getVideo(first.videoId);
		expect(ready).toMatchObject({ status: 'ready', lengthSeconds: 90, title: 'Hem' });
		expect(ready.thumbnailUrl).toContain(first.videoId);
	});

	it('lists newest first with search and paging, and deletes', async () => {
		const fake = createFakeVideoHost();
		await fake.createVideo('Skirt lining');
		await fake.createVideo('Pressing');
		const skirt2 = await fake.createVideo('Skirt hem');

		const page = await fake.listVideos({ page: 1, perPage: 1, search: 'skirt' });
		expect(page.total).toBe(2);
		expect(page.items.map((video) => video.videoId)).toEqual([skirt2.videoId]);

		await fake.deleteVideo(skirt2.videoId);
		await expect(fake.getVideo(skirt2.videoId)).rejects.toBeInstanceOf(VideoHostError);
	});

	it('signs embed URLs and tickets with the real formulas', async () => {
		const fake = createFakeVideoHost({ now: () => FIXED_TIME.getTime() });
		const url = new URL(await fake.embedUrl({ libraryId: '100', videoId: 'v' }, TTL_SECONDS));
		expect(url.searchParams.get('token')).toBe(sha256('fake-embed-key' + 'v' + FIXED_EXPIRES));

		const ticket = await fake.uploadTicket('v', TTL_SECONDS);
		expect(ticket.headers.AuthorizationSignature).toBe(
			sha256('100' + 'fake-api-key' + FIXED_EXPIRES + 'v')
		);
	});
});
