import { describe, expect, it } from 'vitest';
import {
	checkEligibility,
	computeQuote,
	eligibleLines,
	type PromoRejection,
	type PromoRule,
	type QuoteInputLine
} from './pricing.ts';

const COURSE = 'c0000000-0000-4000-8000-000000000001';
const BUNDLE = 'b0000000-0000-4000-8000-000000000002';
const SINGLE = 'a0000000-0000-4000-8000-000000000003';

function line(
	productId: string,
	effectivePrice: number,
	{ onSale = false, listPrice = effectivePrice }: { onSale?: boolean; listPrice?: number } = {}
): QuoteInputLine {
	return { productId, title: productId.slice(0, 1), listPrice, effectivePrice, onSale };
}

function rule(overrides: Partial<PromoRule>): PromoRule {
	return {
		id: 'promo-1',
		code: 'TEST',
		discountType: 'percentage',
		discountValue: 10,
		appliesTo: 'all',
		productIds: [],
		minSubtotal: null,
		stackableWithSale: false,
		...overrides
	};
}

interface Row {
	name: string;
	lines: QuoteInputLine[];
	promo: PromoRule | null;
	/** Expected per-line discount, in input order. */
	discounts: number[];
	rejection: PromoRejection | null;
}

const rows: Row[] = [
	{
		name: 'no promo: totals equal the subtotal',
		lines: [line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: null,
		discounts: [0, 0],
		rejection: null
	},
	{
		name: 'percentage rounds half-up on an odd price (10% of 999 → 100)',
		lines: [line(SINGLE, 999)],
		promo: rule({ discountValue: 10 }),
		discounts: [100],
		rejection: null
	},
	{
		name: 'percentage rounds each line on its own (15% of 1999 → 300, of 2901 → 435)',
		lines: [line(BUNDLE, 1999), line(SINGLE, 2901)],
		promo: rule({ discountValue: 15 }),
		discounts: [300, 435],
		rejection: null
	},
	{
		name: 'percentage rounds down below the half-penny (33% of 1001 → 330)',
		lines: [line(SINGLE, 1001)],
		promo: rule({ discountValue: 33 }),
		discounts: [330],
		rejection: null
	},
	{
		name: 'scoped percentage leaves non-eligible lines untouched',
		lines: [line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: rule({ discountValue: 50, appliesTo: 'products', productIds: [SINGLE] }),
		discounts: [0, 450],
		rejection: null
	},
	{
		name: 'fixed pro-rata: remainder lands on the most expensive line and sums exactly',
		lines: [line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: rule({ discountType: 'fixed', discountValue: 1000 }),
		// floor(1000·2900/3800) = 763, floor(1000·900/3800) = 236, remainder 1 → 764
		discounts: [764, 236],
		rejection: null
	},
	{
		name: 'fixed pro-rata: remainder goes to the dearest line even when it is not first',
		lines: [line(SINGLE, 900), line(BUNDLE, 2900)],
		promo: rule({ discountType: 'fixed', discountValue: 1000 }),
		discounts: [236, 764],
		rejection: null
	},
	{
		name: 'fixed pro-rata over three lines sums to the fixed amount',
		lines: [line(COURSE, 14900), line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: rule({ discountType: 'fixed', discountValue: 3333 }),
		// subtotal 18700: floor(3333·14900/18700) = 2655, floor(3333·2900/18700) = 516,
		// floor(3333·900/18700) = 160; 2655 + 516 + 160 = 3331, remainder 2 → 2657
		discounts: [2657, 516, 160],
		rejection: null
	},
	{
		name: 'fixed scoped to some lines shares only among them',
		lines: [line(COURSE, 14900), line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: rule({
			discountType: 'fixed',
			discountValue: 1000,
			appliesTo: 'products',
			productIds: [BUNDLE, SINGLE]
		}),
		discounts: [0, 764, 236],
		rejection: null
	},
	{
		name: 'fixed larger than the eligible subtotal is capped at it (then floored at 30p)',
		lines: [line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: rule({ discountType: 'fixed', discountValue: 999_999 }),
		discounts: [2870, 870],
		rejection: null
	},
	{
		name: 'stackable_with_sale = false excludes the line on sale',
		lines: [line(BUNDLE, 1900, { onSale: true, listPrice: 2900 }), line(SINGLE, 900)],
		promo: rule({ discountValue: 10, stackableWithSale: false }),
		discounts: [0, 90],
		rejection: null
	},
	{
		name: 'stackable_with_sale = true discounts the sale price too',
		lines: [line(BUNDLE, 1900, { onSale: true, listPrice: 2900 }), line(SINGLE, 900)],
		promo: rule({ discountValue: 10, stackableWithSale: true }),
		discounts: [190, 90],
		rejection: null
	},
	{
		name: '30p floor per line: a 99% code leaves 30p and drops the difference',
		lines: [line(SINGLE, 1000), line(BUNDLE, 2900)],
		promo: rule({ discountValue: 99 }),
		// raw 990 → 970 (unit 30); raw 2871 → 2870 (unit 30)
		discounts: [970, 2870],
		rejection: null
	},
	{
		name: '30p floor: a line already at 30p takes no discount while others do',
		lines: [line(SINGLE, 30), line(BUNDLE, 2900)],
		promo: rule({ discountValue: 50 }),
		discounts: [0, 1450],
		rejection: null
	},
	{
		name: 'min_subtotal unmet by the eligible lines → below_minimum, nothing discounted',
		lines: [line(COURSE, 14900), line(SINGLE, 900)],
		promo: rule({ minSubtotal: 1000, appliesTo: 'products', productIds: [SINGLE] }),
		discounts: [0, 0],
		rejection: 'below_minimum'
	},
	{
		name: 'min_subtotal met exactly applies',
		lines: [line(SINGLE, 900)],
		promo: rule({ minSubtotal: 900 }),
		discounts: [90],
		rejection: null
	},
	{
		name: 'scope matches nothing in the cart → not_eligible',
		lines: [line(BUNDLE, 2900), line(SINGLE, 900)],
		promo: rule({ appliesTo: 'products', productIds: [COURSE] }),
		discounts: [0, 0],
		rejection: 'not_eligible'
	},
	{
		name: 'every line on sale with a non-stackable code → not_eligible',
		lines: [line(BUNDLE, 1900, { onSale: true, listPrice: 2900 })],
		promo: rule({ stackableWithSale: false }),
		discounts: [0],
		rejection: 'not_eligible'
	},
	{
		name: 'a code that takes nothing off (1% of 30p rounds to 0) → not_eligible',
		lines: [line(SINGLE, 30)],
		promo: rule({ discountValue: 1 }),
		discounts: [0],
		rejection: 'not_eligible'
	},
	{
		name: 'empty cart with a code → not_eligible, zero totals',
		lines: [],
		promo: rule({}),
		discounts: [],
		rejection: 'not_eligible'
	}
];

describe('computeQuote', () => {
	it.each(rows)('$name', ({ lines, promo, discounts, rejection }) => {
		const quote = computeQuote({ lines, promo });

		expect(quote.lines.map((l) => l.discount)).toEqual(discounts);
		expect(quote.rejection).toBe(rejection);
		expect(quote.lines.map((l) => l.productId)).toEqual(lines.map((l) => l.productId));

		const expectedSubtotal = lines.reduce((sum, l) => sum + l.effectivePrice, 0);
		const expectedDiscount = discounts.reduce((sum, d) => sum + d, 0);
		expect(quote.subtotal).toBe(expectedSubtotal);
		expect(quote.discountTotal).toBe(expectedDiscount);
		expect(quote.total).toBe(expectedSubtotal - expectedDiscount);
		// The invariant every row must hold: the Stripe line items add up to the charge.
		expect(quote.lines.reduce((sum, l) => sum + l.unitAmount, 0)).toBe(quote.total);
		for (const l of quote.lines) {
			expect(l.unitAmount).toBe(l.effectivePrice - l.discount);
			expect(l.unitAmount).toBeGreaterThanOrEqual(30);
		}

		if (promo && rejection === null) {
			expect(quote.promo).toEqual({ code: promo.code, id: promo.id });
		} else {
			expect(quote.promo).toBeNull();
		}
	});

	it('has at least twelve table rows', () => {
		expect(rows.length).toBeGreaterThanOrEqual(12);
	});

	it('does not mutate its input lines', () => {
		const lines = [line(BUNDLE, 2900)];
		const snapshot = structuredClone(lines);
		computeQuote({ lines, promo: rule({ discountValue: 50 }) });
		expect(lines).toEqual(snapshot);
	});
});

describe('eligibleLines / checkEligibility', () => {
	const lines = [
		line(COURSE, 14900),
		line(BUNDLE, 1900, { onSale: true, listPrice: 2900 }),
		line(SINGLE, 900)
	];

	it('applies_to = all takes every line not on sale', () => {
		expect(eligibleLines(lines, rule({})).map((l) => l.productId)).toEqual([COURSE, SINGLE]);
	});

	it('applies_to = products keeps only the scoped lines, in cart order', () => {
		const scoped = rule({ appliesTo: 'products', productIds: [SINGLE, COURSE] });
		expect(eligibleLines(lines, scoped).map((l) => l.productId)).toEqual([COURSE, SINGLE]);
	});

	it('stackable codes include sale lines', () => {
		expect(eligibleLines(lines, rule({ stackableWithSale: true }))).toHaveLength(3);
	});

	it('reports not_eligible before below_minimum', () => {
		const scoped = rule({ appliesTo: 'products', productIds: ['nope'], minSubtotal: 1 });
		expect(checkEligibility(lines, scoped)).toBe('not_eligible');
		expect(checkEligibility(lines, rule({ minSubtotal: 15801 }))).toBe('below_minimum');
		expect(checkEligibility(lines, rule({ minSubtotal: 15800 }))).toBeNull();
		expect(checkEligibility(lines, rule({}))).toBeNull();
	});
});
