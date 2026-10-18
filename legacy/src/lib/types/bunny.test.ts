import { describe, expect, it } from 'vitest';
import { parseBunnyUrl } from './index';

describe('parseBunnyUrl', () => {
	it('parses a bunny:{libraryId}/{videoId} reference', () => {
		expect(parseBunnyUrl('bunny:123/abc-def')).toEqual({ libraryId: '123', videoId: 'abc-def' });
	});

	it('returns null for an https URL', () => {
		expect(parseBunnyUrl('https://x')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(parseBunnyUrl('')).toBeNull();
	});

	it('returns null when the library id is missing', () => {
		expect(parseBunnyUrl('bunny:/abc')).toBeNull();
	});
});
