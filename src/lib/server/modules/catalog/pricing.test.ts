import { describe, expect, it } from 'vitest';
import { effectivePrice, type Priced } from './pricing.ts';

const NOW = new Date('2026-06-15T12:00:00Z');

function priced(overrides: Partial<Priced> = {}): Priced {
	return {
		price: 14900,
		sale_price: 9900,
		sale_starts_at: '2026-06-01T00:00:00Z',
		sale_ends_at: '2026-07-01T00:00:00Z',
		...overrides
	};
}

describe('effectivePrice', () => {
	it('charges the list price when there is no sale price', () => {
		expect(effectivePrice(priced({ sale_price: null }), NOW)).toEqual({
			listPrice: 14900,
			price: 14900,
			onSale: false,
			saleEndsAt: null
		});
	});

	it('is not on sale before the window starts', () => {
		const result = effectivePrice(priced(), new Date('2026-05-31T23:59:59Z'));
		expect(result).toEqual({ listPrice: 14900, price: 14900, onSale: false, saleEndsAt: null });
	});

	it('is on sale inside the window, from the first instant', () => {
		expect(effectivePrice(priced(), NOW)).toEqual({
			listPrice: 14900,
			price: 9900,
			onSale: true,
			saleEndsAt: '2026-07-01T00:00:00Z'
		});
		expect(effectivePrice(priced(), new Date('2026-06-01T00:00:00Z')).onSale).toBe(true);
	});

	it('is not on sale once the window ends (end is exclusive)', () => {
		expect(effectivePrice(priced(), new Date('2026-07-01T00:00:00Z')).onSale).toBe(false);
		expect(effectivePrice(priced(), new Date('2026-08-01T00:00:00Z')).price).toBe(14900);
	});

	it('treats a missing start or end as open-ended', () => {
		const noStart = effectivePrice(
			priced({ sale_starts_at: null }),
			new Date('2000-01-01T00:00:00Z')
		);
		expect(noStart).toMatchObject({
			price: 9900,
			onSale: true,
			saleEndsAt: '2026-07-01T00:00:00Z'
		});

		const noEnd = effectivePrice(priced({ sale_ends_at: null }), new Date('2099-01-01T00:00:00Z'));
		expect(noEnd).toEqual({ listPrice: 14900, price: 9900, onSale: true, saleEndsAt: null });

		const always = effectivePrice(priced({ sale_starts_at: null, sale_ends_at: null }), NOW);
		expect(always.onSale).toBe(true);
	});
});
