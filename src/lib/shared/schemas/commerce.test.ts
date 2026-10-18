import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
	bulkGenerateSchema,
	cartItemSchema,
	cartPromoSchema,
	cartStateSchema,
	promoInputSchema
} from './commerce.ts';

const PRODUCT = '00000000-0000-4000-8000-000000000001';

function issuesOf(schema: v.GenericSchema, input: unknown): string[] {
	const result = v.safeParse(schema, input);
	return result.success ? [] : result.issues.map((issue) => issue.message);
}

describe('promoCodeField (cart promo action)', () => {
	it('trims and upper-cases, rejects anything outside the pattern', () => {
		expect(v.parse(cartPromoSchema, { code: '  spring20 ' })).toEqual({ code: 'SPRING20' });
		expect(issuesOf(cartPromoSchema, { code: 'x' })).toEqual([
			'Codes are 2–32 letters, numbers, hyphens or underscores'
		]);
		expect(issuesOf(cartPromoSchema, { code: 'has space' })).toHaveLength(1);
		expect(issuesOf(cartPromoSchema, { code: 7 })).toEqual(['Enter a code']);
	});
});

describe('cart schemas', () => {
	it('cart actions take a product uuid', () => {
		expect(v.parse(cartItemSchema, { productId: PRODUCT })).toEqual({ productId: PRODUCT });
		expect(issuesOf(cartItemSchema, { productId: 'nope' })).toEqual(['Invalid id']);
	});

	it('cart state is a list of uuids and a nullable code', () => {
		expect(v.parse(cartStateSchema, { items: [PRODUCT], promoCode: null })).toEqual({
			items: [PRODUCT],
			promoCode: null
		});
		expect(v.is(cartStateSchema, { items: [PRODUCT], promoCode: 'GIFT-1' })).toBe(true);
		expect(v.is(cartStateSchema, { items: ['x'], promoCode: null })).toBe(false);
		expect(v.is(cartStateSchema, { items: [PRODUCT] })).toBe(false);
	});
});

describe('promoInputSchema', () => {
	const valid = {
		code: ' spring20 ',
		discountType: 'percentage',
		discountValue: 20,
		appliesTo: 'all'
	};

	it('fills defaults and normalises the code', () => {
		expect(v.parse(promoInputSchema, valid)).toEqual({
			code: 'SPRING20',
			description: '',
			discountType: 'percentage',
			discountValue: 20,
			appliesTo: 'all',
			productIds: [],
			minSubtotal: null,
			maxRedemptions: null,
			maxRedemptionsPerUser: null,
			startsAt: null,
			endsAt: null,
			isActive: true,
			stackableWithSale: false
		});
	});

	it('keeps a percentage between 1 and 99 and a fixed amount at 1p or more', () => {
		expect(issuesOf(promoInputSchema, { ...valid, discountValue: 100 })).toEqual([
			'A percentage must be between 1 and 99'
		]);
		expect(
			issuesOf(promoInputSchema, { ...valid, discountType: 'fixed', discountValue: 0 })
		).toEqual(['Discount must be at least 1']);
		expect(issuesOf(promoInputSchema, { ...valid, discountValue: 12.5 })).toEqual([
			'Discount must be a whole number'
		]);
		expect(
			issuesOf(promoInputSchema, { ...valid, discountType: 'fixed', discountValue: 15000 })
		).toEqual([]);
	});

	it('a product scope needs at least one product', () => {
		expect(issuesOf(promoInputSchema, { ...valid, appliesTo: 'products' })).toEqual([
			'Select at least one product'
		]);
		expect(
			issuesOf(promoInputSchema, { ...valid, appliesTo: 'products', productIds: [PRODUCT] })
		).toEqual([]);
		expect(
			issuesOf(promoInputSchema, { ...valid, appliesTo: 'products', productIds: ['bad'] })
		).toEqual(['Invalid id']);
	});

	it('limits and minimum are null or positive whole numbers', () => {
		const parsed = v.parse(promoInputSchema, {
			...valid,
			maxRedemptions: 50,
			maxRedemptionsPerUser: 1,
			minSubtotal: 1000
		});
		expect(parsed).toMatchObject({
			maxRedemptions: 50,
			maxRedemptionsPerUser: 1,
			minSubtotal: 1000
		});
		expect(issuesOf(promoInputSchema, { ...valid, maxRedemptions: 0 })).toEqual([
			'Must be at least 1'
		]);
		expect(issuesOf(promoInputSchema, { ...valid, minSubtotal: 1.5 })).toEqual([
			'Must be a whole number'
		]);
	});

	it('turns empty dates into null, stores ISO strings and orders the window', () => {
		const parsed = v.parse(promoInputSchema, {
			...valid,
			startsAt: '',
			endsAt: '2026-11-01T00:00:00Z'
		});
		expect(parsed.startsAt).toBeNull();
		expect(parsed.endsAt).toBe('2026-11-01T00:00:00.000Z');
		expect(
			issuesOf(promoInputSchema, {
				...valid,
				startsAt: '2026-11-02T00:00:00Z',
				endsAt: '2026-11-01T00:00:00Z'
			})
		).toEqual(['The code must end after it starts']);
		expect(issuesOf(promoInputSchema, { ...valid, endsAt: 'not a date' })).toEqual([
			'Must be a valid date'
		]);
	});
});

describe('bulkGenerateSchema', () => {
	const valid = {
		prefix: ' gift ',
		count: 25,
		discountType: 'fixed',
		discountValue: 500,
		appliesTo: 'all'
	};

	it('normalises the prefix and bounds the count', () => {
		expect(v.parse(bulkGenerateSchema, valid)).toMatchObject({
			prefix: 'GIFT',
			count: 25,
			isActive: true,
			stackableWithSale: false
		});
		expect(issuesOf(bulkGenerateSchema, { ...valid, count: 0 })).toEqual([
			'Generate at least 1 code'
		]);
		expect(issuesOf(bulkGenerateSchema, { ...valid, count: 501 })).toEqual([
			'Generate at most 500 codes at once'
		]);
		expect(issuesOf(bulkGenerateSchema, { ...valid, prefix: 'gift code' })).toEqual([
			'Prefixes are 1–20 letters, numbers, hyphens or underscores'
		]);
	});

	it('shares the cross-field rules with the single-code form', () => {
		expect(
			issuesOf(bulkGenerateSchema, { ...valid, discountType: 'percentage', discountValue: 100 })
		).toEqual(['A percentage must be between 1 and 99']);
		expect(issuesOf(bulkGenerateSchema, { ...valid, appliesTo: 'products' })).toEqual([
			'Select at least one product'
		]);
	});
});
