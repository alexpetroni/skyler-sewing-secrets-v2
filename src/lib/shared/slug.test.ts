import { describe, expect, it } from 'vitest';
import { slugify } from './slug.ts';

describe('slugify', () => {
	it('lowercases, drops accents and joins words with single hyphens', () => {
		expect(slugify('  Zips & Buttonholes: Café Edition!  ')).toBe(
			'zips-and-buttonholes-cafe-edition'
		);
	});

	it('returns an empty string when nothing usable is left', () => {
		expect(slugify('!!!')).toBe('');
	});

	it('keeps at most 120 characters without a trailing hyphen', () => {
		const slug = slugify(`${'a'.repeat(119)} b`);
		expect(slug).toBe('a'.repeat(119));
	});
});
