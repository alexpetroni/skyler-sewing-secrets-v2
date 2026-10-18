import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	createBunnyStorage,
	signedStorageUrl,
	STORAGE_API_BASE,
	StorageError,
	storagePathOf
} from './bunny-storage.ts';
import { createFakeLogger } from './fakes/logger.ts';
import { createFakeStorage } from './fakes/storage.ts';

const CDN = 'https://files.example.test';
const KEY = 'cdn-token-key';
/** 2026-10-18T12:00:00Z */
const NOW_MS = Date.UTC(2026, 9, 18, 12);
const NOW = Math.floor(NOW_MS / 1000);

function expectedToken(path: string, expires: number): string {
	return createHash('sha256')
		.update(`${KEY}/${path}${expires}`)
		.digest('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

interface Call {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
}

function fakeFetch(status = 201) {
	const calls: Call[] = [];
	const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({
			url: String(input),
			method: init?.method ?? 'GET',
			headers: Object.fromEntries(new Headers(init?.headers).entries()),
			body: init?.body
		});
		return new Response(null, { status });
	}) as typeof fetch;
	return { calls, fetchFn };
}

describe('signedStorageUrl', () => {
	it('signs base64url(sha256(key + "/" + path + expires)) with the padding stripped', async () => {
		const expires = NOW + 300;
		const url = await signedStorageUrl(CDN, KEY, 'uploads/2026/10/file.pdf', expires);
		expect(url).toBe(
			`${CDN}/uploads/2026/10/file.pdf?token=${expectedToken('uploads/2026/10/file.pdf', expires)}&expires=${expires}`
		);
		expect(new URL(url).searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
		// A leading slash on the path is not doubled.
		expect(await signedStorageUrl(CDN, KEY, '/a.png', expires)).toBe(
			`${CDN}/a.png?token=${expectedToken('a.png', expires)}&expires=${expires}`
		);
	});
});

describe('storagePathOf', () => {
	it('returns the path of a URL on the pull zone and null for any other URL', () => {
		expect(storagePathOf(CDN, `${CDN}/uploads/2026/10/x.jpg`)).toBe('uploads/2026/10/x.jpg');
		expect(storagePathOf(`${CDN}/`, `${CDN}/uploads/x%20y.jpg?width=32`)).toBe('uploads/x y.jpg');
		expect(storagePathOf(CDN, 'https://files.example.test.evil.com/x.jpg')).toBeNull();
		expect(storagePathOf(CDN, 'https://other.example.com/x.jpg')).toBeNull();
		expect(storagePathOf(CDN, `${CDN}/`)).toBeNull();
	});
});

describe('createBunnyStorage', () => {
	const logger = () => createFakeLogger();

	it('puts and deletes through the Storage API with the zone key, returning the plain URL', async () => {
		const { calls, fetchFn } = fakeFetch();
		const storage = createBunnyStorage({
			zone: 'zone-a',
			apiKey: 'zone-password',
			cdnUrl: `${CDN}/`,
			tokenKey: KEY,
			fetch: fetchFn,
			log: logger(),
			now: () => NOW_MS
		});
		const bytes = new Uint8Array([1, 2, 3]);

		expect(await storage.put('uploads/a.png', bytes, 'image/png')).toBe(`${CDN}/uploads/a.png`);
		await storage.delete('uploads/a.png');

		expect(calls).toEqual([
			{
				url: `${STORAGE_API_BASE}/zone-a/uploads/a.png`,
				method: 'PUT',
				headers: { accesskey: 'zone-password', 'content-type': 'image/png' },
				body: bytes
			},
			{
				url: `${STORAGE_API_BASE}/zone-a/uploads/a.png`,
				method: 'DELETE',
				headers: { accesskey: 'zone-password' },
				body: undefined
			}
		]);
	});

	it('throws a StorageError with the status on a failed call', async () => {
		const { fetchFn } = fakeFetch(401);
		const storage = createBunnyStorage({
			zone: 'zone-a',
			apiKey: 'bad',
			cdnUrl: CDN,
			fetch: fetchFn,
			log: logger()
		});
		const err = await storage.put('x.png', new Uint8Array(), 'image/png').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(StorageError);
		expect(err).toMatchObject({ status: 401 });
	});

	it('signs URLs with the token key and the clock; download URLs only for files on the zone', async () => {
		const storage = createBunnyStorage({
			zone: 'z',
			apiKey: 'k',
			cdnUrl: CDN,
			tokenKey: KEY,
			fetch: fakeFetch().fetchFn,
			log: logger(),
			now: () => NOW_MS
		});
		const expires = NOW + 300;
		expect(await storage.signedUrl('uploads/f.pdf', 300)).toBe(
			`${CDN}/uploads/f.pdf?token=${expectedToken('uploads/f.pdf', expires)}&expires=${expires}`
		);
		expect(await storage.downloadUrl(`${CDN}/uploads/f.pdf`, 300)).toBe(
			`${CDN}/uploads/f.pdf?token=${expectedToken('uploads/f.pdf', expires)}&expires=${expires}`
		);
		expect(await storage.downloadUrl('https://elsewhere.example.com/f.pdf', 300)).toBe(
			'https://elsewhere.example.com/f.pdf'
		);
	});

	it('serves plain URLs without a token key and warns once', async () => {
		const log = logger();
		const storage = createBunnyStorage({
			zone: 'z',
			apiKey: 'k',
			cdnUrl: CDN,
			fetch: fakeFetch().fetchFn,
			log
		});
		expect(await storage.signedUrl('uploads/f.pdf', 300)).toBe(`${CDN}/uploads/f.pdf`);
		expect(await storage.signedUrl('uploads/g.pdf', 300)).toBe(`${CDN}/uploads/g.pdf`);
		const warnings = log.entries.filter((entry) => entry.level === 'warn');
		expect(warnings).toHaveLength(1);
		expect(warnings[0].message).toMatch(/BUNNY_CDN_TOKEN_KEY/);
	});
});

describe('createFakeStorage', () => {
	it('keeps files in memory and signs with the same formula as the real adapter', async () => {
		const fake = createFakeStorage({ cdnUrl: CDN, tokenKey: KEY, now: () => NOW_MS });
		expect(await fake.put('uploads/a.png', new Uint8Array([9]), 'image/png')).toBe(
			`${CDN}/uploads/a.png`
		);
		expect(fake.files.get('uploads/a.png')).toEqual({
			bytes: new Uint8Array([9]),
			contentType: 'image/png'
		});
		expect(await fake.downloadUrl(`${CDN}/uploads/a.png`, 60)).toBe(
			await signedStorageUrl(CDN, KEY, 'uploads/a.png', NOW + 60)
		);
		await fake.delete('uploads/a.png');
		expect(fake.files.size).toBe(0);
	});
});
