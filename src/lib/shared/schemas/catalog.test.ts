import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	productContentsSchemas,
	productCreateSchema,
	productInputSchema,
	productPricingSchema,
	toUtcDateTimeLocal
} from './catalog.ts';

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

describe('product editor schemas', () => {
	const A = '00000000-0000-4000-8000-00000000000a';
	const B = '00000000-0000-4000-8000-00000000000b';

	it('contents dedupe in order and apply the rule of the kind', () => {
		const ids = JSON.stringify([B, A, B]);
		expect(v.parse(productContentsSchemas.bundle, { lessonIds: ids })).toEqual({
			lessonIds: [B, A]
		});
		expect(v.safeParse(productContentsSchemas.single, { lessonIds: ids }).success).toBe(false);
		expect(v.parse(productContentsSchemas.single, { lessonIds: JSON.stringify([A, A]) })).toEqual({
			lessonIds: [A]
		});
		expect(v.parse(productContentsSchemas.course, {})).toEqual({ lessonIds: [] });
		expect(
			v.safeParse(productContentsSchemas.bundle, { lessonIds: '{"a":1}' }).issues?.[0].message
		).toBe('Invalid item list');
	});

	it('create derives the slug from the title and fills the defaults', () => {
		expect(
			v.parse(productCreateSchema, { kind: 'single', title: 'Hems & Edges', price: '9.5' })
		).toMatchObject({ slug: 'hems-and-edges', price: 950, salePrice: null, lessonId: '' });
		expect(
			v.safeParse(productCreateSchema, { kind: 'bundle', title: '!!!', price: '9' }).issues?.[0]
				.message
		).toBe('Slug must be lowercase letters, numbers, and hyphens only');
	});

	it('pricing floors the price at 30p and round-trips the UTC sale window', () => {
		expect(v.safeParse(productPricingSchema, { price: '0.29' }).issues?.[0].message).toBe(
			'Price must be at least £0.30'
		);
		const output = v.parse(productPricingSchema, {
			price: '10',
			salePrice: '',
			saleStartsAt: '2026-11-01T09:30',
			saleEndsAt: ''
		});
		expect(output).toEqual({
			price: 1000,
			salePrice: null,
			saleStartsAt: '2026-11-01T09:30:00.000Z',
			saleEndsAt: null
		});
		expect(toUtcDateTimeLocal(output.saleStartsAt)).toBe('2026-11-01T09:30');
		expect(toUtcDateTimeLocal(null)).toBe('');
	});
});
