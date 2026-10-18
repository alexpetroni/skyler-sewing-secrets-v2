import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { BUNNY_EMBED_TOKEN_KEY: 'k' } }));

import { getBunnyEmbedUrl } from './bunny';

const FIXED_TIME = new Date('2026-09-06T12:00:00.000Z');
const TTL_SECONDS = 60;

describe('getBunnyEmbedUrl (signed)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(FIXED_TIME);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('sets expires to the current time in seconds plus the ttl', async () => {
		const url = new URL((await getBunnyEmbedUrl('bunny:123/abc', TTL_SECONDS)) as string);
		const expected = Math.floor(FIXED_TIME.getTime() / 1000) + TTL_SECONDS;
		expect(url.searchParams.get('expires')).toBe(String(expected));
	});

	it('signs the token as SHA256_HEX(key + videoId + expires)', async () => {
		const url = new URL((await getBunnyEmbedUrl('bunny:123/abc', TTL_SECONDS)) as string);
		const expires = Math.floor(FIXED_TIME.getTime() / 1000) + TTL_SECONDS;
		const expected = createHash('sha256').update('k' + 'abc' + expires).digest('hex');
		const token = url.searchParams.get('token');
		expect(token).toMatch(/^[0-9a-f]{64}$/);
		expect(token).toBe(expected);
	});
});
