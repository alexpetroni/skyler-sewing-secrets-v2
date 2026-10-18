import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import Cta from './Cta.svelte';
import Features from './Features.svelte';
import ModulesPreview from './ModulesPreview.svelte';
import Offer from './Offer.svelte';
import { approxHours, type MarketingOutline, type OfferProduct } from './outline.ts';

// OptimizedImage (used by ModulesPreview) reads the CDN base from the public env.
vi.mock('$app/env/public', () => ({ PUBLIC_BUNNY_CDN_URL: undefined }));

const FLAGSHIP: OfferProduct = {
	slug: 'skylers-sewing-secrets',
	title: "Skyler's Sewing Secrets",
	pricing: { listPrice: 14900, price: 14900, onSale: false }
};

const TOTALS = { modules: 6, bonusModules: 1, videos: 40, minutes: 264 };

const OUTLINE: MarketingOutline = {
	modules: [
		{
			id: 'm1',
			slug: 'basics',
			title: 'Basics',
			description: 'Tools and stitches',
			thumbnailUrl: null,
			isBonus: false,
			lessons: [
				{ kind: 'video', durationSeconds: 600 },
				{ kind: 'video', durationSeconds: 630 },
				{ kind: 'video', durationSeconds: null }
			]
		},
		{
			id: 'm2',
			slug: 'chanel-skirt',
			title: 'Chanel Skirt',
			description: 'The bonus project',
			thumbnailUrl: null,
			isBonus: true,
			lessons: [
				{ kind: 'video', durationSeconds: 1200 },
				{ kind: 'article', durationSeconds: null }
			]
		}
	],
	totals: { modules: 1, bonusModules: 1, videos: 4, minutes: 41 }
};

/** Text content with tags removed and whitespace collapsed. */
function text(html: string): string {
	return html
		.replace(/<!--.*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

describe('Offer', () => {
	it('renders the formatted price and links to the product page', () => {
		const { body } = render(Offer, { props: { product: FLAGSHIP, totals: TOTALS } });

		expect(text(body)).toContain('£149.00');
		expect(body).toContain('href="/products/skylers-sewing-secrets"');
		expect(body).not.toContain('href="/checkout"');
	});

	it('derives the included list from the outline totals', () => {
		const { body } = render(Offer, { props: { product: FLAGSHIP, totals: TOTALS, slides: 7 } });
		const content = text(body);

		expect(content).toContain('7 structured modules');
		expect(content).toContain('40 videos and 7 slides tutorials');
		expect(content).toContain('Approx. 4½ hours of video content');
	});

	it('shows the sale price with the list price struck through while on sale', () => {
		const product = { ...FLAGSHIP, pricing: { listPrice: 14900, price: 9900, onSale: true } };
		const { body } = render(Offer, { props: { product, totals: TOTALS } });

		expect(text(body)).toContain('£99.00');
		expect(body).toMatch(/<s>£149\.00<\/s>/);
	});
});

describe('ModulesPreview', () => {
	it('renders one card per module with its video count and minutes', () => {
		const { body } = render(ModulesPreview, { props: { outline: OUTLINE } });
		const content = text(body);

		expect(body.match(/href="\/modules\/[a-z-]+"/g)).toEqual([
			'href="/modules/basics"',
			'href="/modules/chanel-skirt"'
		]);
		expect(content).toContain('2 modules');
		expect(content).toContain('Basics 3 videos · 21 min');
		expect(content).toContain('Chanel Skirt 1 videos · 20 min · 1 slides');
		expect(content).toContain('Module 1');
		expect(content).toContain('Bonus');
	});
});

describe('Features', () => {
	it('heads the curriculum with the outline counts and numbers only course modules', () => {
		const content = text(render(Features, { props: { outline: OUTLINE } }).body);

		expect(content).toContain('2 modules, 4 videos and 1 slide tutorials');
		expect(content).toContain('1 Module 1 Basics Tools and stitches');
		expect(content).toContain('★ Bonus module Chanel Skirt The bonus project');
	});
});

describe('Cta', () => {
	it('quotes the flagship price and links to its product page', () => {
		const { body } = render(Cta, { props: { product: FLAGSHIP } });

		expect(text(body)).toContain('Lifetime membership for £149.00, paid once. No hidden fees');
		expect(body).toContain('href="/products/skylers-sewing-secrets"');
	});
});

describe('approxHours', () => {
	it('rounds to the nearest half hour and falls back to minutes under a quarter hour', () => {
		expect(approxHours(264)).toBe('4½ hrs');
		expect(approxHours(240, 'hours')).toBe('4 hours');
		expect(approxHours(20)).toBe('½ hrs');
		expect(approxHours(10)).toBe('10 min');
	});
});
