import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { productInputSchema } from './catalog.ts';

const valid = {
	kind: 'bundle',
	slug: 'zippers-pack',
	title: ' Zippers Pack ',
	price: 2900
};

function issuesOf(input: unknown): string[] {
	const result = v.safeParse(productInputSchema, input);
	return result.success ? [] : result.issues.map((issue) => issue.message);
}

describe('productInputSchema', () => {
	it('fills defaults, trims text and turns empty dates into null', () => {
		const output = v.parse(productInputSchema, {
			...valid,
			saleStartsAt: '',
			saleEndsAt: '2026-07-01T00:00'
		});
		expect(output).toEqual({
			kind: 'bundle',
			slug: 'zippers-pack',
			title: 'Zippers Pack',
			tagline: '',
			descriptionMd: '',
			coverImageUrl: '',
			price: 2900,
			salePrice: null,
			saleStartsAt: null,
			saleEndsAt: new Date('2026-07-01T00:00').toISOString(),
			isFeatured: false,
			sortOrder: 0
		});
	});

	it('bounds the price, requires a sale price below it and a window that ends after it starts', () => {
		expect(issuesOf({ ...valid, price: 29 })).toEqual(['Price must be at least 30p']);
		expect(issuesOf({ ...valid, price: 10_000_001 })).toEqual(['Price must be at most 10000000p']);
		expect(issuesOf({ ...valid, price: 30.5 })).toEqual(['Price must be a whole number of pence']);
		expect(issuesOf({ ...valid, salePrice: 2900 })).toEqual([
			'Sale price must be lower than the price'
		]);
		expect(issuesOf({ ...valid, salePrice: 1900 })).toEqual([]);
		expect(
			issuesOf({
				...valid,
				saleStartsAt: '2026-07-01T00:00:00Z',
				saleEndsAt: '2026-06-01T00:00:00Z'
			})
		).toEqual(['Sale must end after it starts']);
		expect(issuesOf({ ...valid, saleEndsAt: 'next tuesday' })).toEqual(['Must be a valid date']);
	});

	it('validates the kind, slug, lengths and cover URL', () => {
		expect(issuesOf({ ...valid, kind: 'course-ish' })).toEqual(['Choose course, bundle or single']);
		expect(issuesOf({ ...valid, slug: 'Zippers Pack' })).toEqual([
			'Slug must be lowercase letters, numbers, and hyphens only'
		]);
		expect(issuesOf({ ...valid, title: 'x'.repeat(121) })).toEqual([
			'Title must be at most 120 characters'
		]);
		expect(issuesOf({ ...valid, tagline: 'x'.repeat(201) })).toEqual([
			'Tagline must be at most 200 characters'
		]);
		expect(issuesOf({ ...valid, descriptionMd: 'x'.repeat(20_001) })).toEqual([
			'Description must be at most 20000 characters'
		]);
		expect(issuesOf({ ...valid, coverImageUrl: 'http://cdn.example.com/a.jpg' })).toEqual([
			'Must be an https:// URL'
		]);
	});
});
