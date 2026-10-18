import { describe, expect, it } from 'vitest';
import { calculateDiscount } from './stripe';

describe('calculateDiscount', () => {
	it('applies a 10% discount in whole pence', () => {
		expect(calculateDiscount(14900, 'percentage', 10)).toEqual({ discount: 1490, finalPrice: 13410 });
	});

	it('rounds a 33% discount to the nearest penny', () => {
		expect(calculateDiscount(14900, 'percentage', 33)).toEqual({ discount: 4917, finalPrice: 9983 });
	});

	it('rounds half a penny up', () => {
		expect(calculateDiscount(101, 'percentage', 50).discount).toBe(51);
	});

	it('subtracts a fixed discount in pence', () => {
		expect(calculateDiscount(14900, 'fixed', 2000)).toEqual({ discount: 2000, finalPrice: 12900 });
	});

	it('caps a fixed discount at the base price', () => {
		expect(calculateDiscount(14900, 'fixed', 20000)).toEqual({ discount: 14900, finalPrice: 0 });
	});

	it('caps a percentage discount over 100% at the base price', () => {
		expect(calculateDiscount(14900, 'percentage', 150)).toEqual({ discount: 14900, finalPrice: 0 });
	});
});
