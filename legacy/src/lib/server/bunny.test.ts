import { describe, expect, it, vi } from 'vitest';

// No BUNNY_EMBED_TOKEN_KEY: the embed URL must be unsigned.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { getBunnyEmbedUrl } from './bunny';

describe('getBunnyEmbedUrl (unsigned)', () => {
	it('builds the plain embed URL for a bunny reference', async () => {
		expect(await getBunnyEmbedUrl('bunny:123/abc')).toBe(
			'https://iframe.mediadelivery.net/embed/123/abc?autoplay=false&preload=true'
		);
	});

	it('returns null for unparsable input', async () => {
		expect(await getBunnyEmbedUrl('https://example.com/video.mp4')).toBeNull();
	});
});
