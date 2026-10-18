import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { PROMO_REJECTION_MESSAGES } from '#lib/shared/promo-messages.ts';
import AddToCartButton from './AddToCartButton.svelte';
import CartBadge from './CartBadge.svelte';
import CartLines from './CartLines.svelte';
import CartSummary from './CartSummary.svelte';
import PriceTag from './PriceTag.svelte';
import ProductCard from './ProductCard.svelte';
import PromoField from './PromoField.svelte';
import type { ShopCartLine, ShopProduct } from './types.ts';

const FLAGSHIP = {
	id: '00000000-0000-4000-8000-000000000149',
	slug: 'the-course',
	title: 'The course',
	price: 14900
};

const BUNDLE: ShopProduct = {
	id: '00000000-0000-4000-8000-000000000029',
	slug: 'zippers',
	kind: 'bundle',
	title: 'Zippers',
	tagline: 'Every zip, invisible to exposed.',
	coverImageUrl: 'https://cdn.example.com/zippers.jpg',
	itemCount: 3,
	durationSeconds: 1800,
	pricing: { price: 2900, listPrice: 2900, onSale: false, saleEndsAt: null }
};

describe('PriceTag', () => {
	it('shows the sale price, the struck-through list price and the end date while on sale', () => {
		const { body } = render(PriceTag, {
			props: {
				price: 1900,
				listPrice: 2900,
				onSale: true,
				saleEndsAt: '2026-10-03T22:59:59Z'
			}
		});
		expect(body).toContain('£19.00');
		expect(body).toMatch(/<s[^>]*>.*£29\.00<\/s>/);
		expect(body).toContain('ends 3 Oct');
		expect(body).toContain('<span class="sr-only">Now</span>');
	});

	it('shows only the price when there is no sale', () => {
		const { body } = render(PriceTag, {
			props: { price: 2900, listPrice: 2900, onSale: false, saleEndsAt: '2026-10-03T22:59:59Z' }
		});
		expect(body).toContain('£29.00');
		expect(body).not.toMatch(/<s[\s>]/);
		expect(body).not.toContain('ends');
		expect(body).not.toContain('Now');
	});
});

describe('CartSummary', () => {
	const totals = { subtotal: 9800, discountTotal: 980, total: 8820, promoCode: 'TENOFF' };

	it('shows the totals, the discount with its code and the course nudge when suggested', () => {
		const { body } = render(CartSummary, {
			props: { ...totals, suggestFlagship: true, flagship: FLAGSHIP }
		});
		expect(body).toContain('£98.00');
		expect(body).toContain('Discount (TENOFF)');
		expect(body).toContain('−£9.80');
		expect(body).toContain('£88.20');
		expect(body).toContain('href="/checkout"');
		expect(body).toContain('Thinking of the full course?');
		expect(body).toContain('href="/products/the-course"');
		expect(body).toContain('£149.00');
		expect(body).toContain(`name="productId" value="${FLAGSHIP.id}"`);
		expect(body).toContain('action="/cart?/add"');
	});

	it('leaves the nudge and the discount row out when neither applies', () => {
		const { body } = render(CartSummary, {
			props: {
				subtotal: 900,
				discountTotal: 0,
				total: 900,
				promoCode: null,
				suggestFlagship: false,
				flagship: FLAGSHIP
			}
		});
		expect(body).toContain('£9.00');
		expect(body).not.toContain('Discount');
		expect(body).not.toContain('Thinking of the full course?');
		expect(body).not.toContain('/cart?/add');
	});
});

describe('PromoField', () => {
	it('offers the apply form and shows a refused code with its mapped message', () => {
		const { body } = render(PromoField, {
			props: { code: 'OLDCODE', rejection: 'expired' }
		});
		expect(body).toContain('action="?/applyPromo"');
		expect(body).toContain('name="code"');
		expect(body).toContain('action="?/removePromo"');
		expect(body).toContain(PROMO_REJECTION_MESSAGES.expired);
		expect(body).not.toContain('applied');
	});

	it('prefers the action error and shows an applied code without the apply form', () => {
		const refused = render(PromoField, {
			props: { code: null, error: PROMO_REJECTION_MESSAGES.not_found }
		});
		expect(refused.body).toContain(PROMO_REJECTION_MESSAGES.not_found);
		expect(refused.body).not.toContain('?/removePromo');

		const applied = render(PromoField, { props: { code: 'TENOFF' } });
		expect(applied.body).toContain('TENOFF');
		expect(applied.body).toContain('applied');
		expect(applied.body).toContain('action="?/removePromo"');
		expect(applied.body).not.toContain('?/applyPromo');
	});
});

describe('AddToCartButton', () => {
	it('posts the product id to the cart and is disabled when owned or in the cart', () => {
		const open = render(AddToCartButton, { props: { productId: BUNDLE.id } });
		expect(open.body).toContain('action="/cart?/add"');
		expect(open.body).toContain(`name="productId" value="${BUNDLE.id}"`);
		expect(open.body).toContain('Add to cart');
		expect(open.body).not.toContain('disabled');

		const owned = render(AddToCartButton, { props: { productId: BUNDLE.id, owned: true } });
		expect(owned.body).toContain('disabled');
		expect(owned.body).toContain('Owned');

		const inCart = render(AddToCartButton, { props: { productId: BUNDLE.id, inCart: true } });
		expect(inCart.body).toContain('disabled');
		expect(inCart.body).toContain('In your cart');
	});
});

describe('ProductCard', () => {
	it('shows the kind, title, tagline, counts, price and an add form', () => {
		const { body } = render(ProductCard, { props: { product: BUNDLE } });
		expect(body).toContain('Bundle');
		expect(body).toContain('Zippers');
		expect(body).toContain('Every zip, invisible to exposed.');
		expect(body).toContain('3 videos');
		expect(body).toContain('30 min');
		expect(body).toContain('£29.00');
		expect(body).toContain('href="/products/zippers"');
		expect(body).toContain('action="/cart?/add"');
	});

	it('marks an owned product and offers no add form', () => {
		const { body } = render(ProductCard, { props: { product: BUNDLE, owned: true } });
		expect(body).toContain('Owned');
		expect(body).not.toContain('/cart?/add');
	});
});

describe('CartLines', () => {
	it('lists each line with a remove form and the per-line saving', () => {
		const lines: ShopCartLine[] = [
			{
				productId: BUNDLE.id,
				slug: 'zippers',
				title: 'Zippers',
				kind: 'bundle',
				coverImageUrl: null,
				listPrice: 2900,
				effectivePrice: 2900,
				onSale: false,
				saleEndsAt: null,
				discount: 580,
				unitAmount: 2320
			},
			{
				productId: FLAGSHIP.id,
				slug: 'buttonholes',
				title: 'Buttonholes',
				kind: 'single',
				coverImageUrl: null,
				listPrice: 900,
				effectivePrice: 700,
				onSale: true,
				saleEndsAt: null,
				discount: 0,
				unitAmount: 700
			}
		];
		const { body } = render(CartLines, { props: { lines } });
		expect(body.match(/action="\?\/remove"/g)).toHaveLength(2);
		expect(body).toContain(`name="productId" value="${BUNDLE.id}"`);
		expect(body).toContain('Code saves £5.80');
		expect(body).toContain('£23.20');
		expect(body).toContain('£7.00');
		expect(body).toMatch(/<s[^>]*>.*£9\.00<\/s>/);
		expect(body.match(/Code saves/g)).toHaveLength(1);
	});
});

describe('CartBadge', () => {
	it('links to the cart with the count', () => {
		const { body } = render(CartBadge, { props: { count: 2 } });
		expect(body).toContain('href="/cart"');
		expect(body).toContain('aria-label="Cart, 2 items"');
		expect(body).toMatch(/>\s*2\s*</);
		expect(render(CartBadge, { props: { count: 0 } }).body).toContain('aria-label="Cart, empty"');
	});
});
