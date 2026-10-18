/**
 * The parts of the course outline (`content.outline()`) and of a catalogue product
 * the marketing sections render. Structural, so server results pass straight in;
 * every figure shown comes from these values, never from static data.
 */
export interface OutlineTotals {
	/** Non-bonus modules. */
	modules: number;
	bonusModules: number;
	videos: number;
	minutes: number;
}

export interface MarketingLesson {
	kind: 'video' | 'article';
	durationSeconds: number | null;
}

export interface MarketingModule {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	thumbnailUrl: string | null;
	isBonus: boolean;
	lessons: MarketingLesson[];
}

export interface MarketingOutline {
	modules: MarketingModule[];
	totals: OutlineTotals;
}

export interface OfferProduct {
	slug: string;
	title: string;
	pricing: { price: number; listPrice: number; onSale: boolean };
}

/** The columns of a `testimonials` row the testimonial sections show. */
export interface TestimonialCard {
	id: string;
	author_name: string;
	author_title: string | null;
	author_avatar_url: string | null;
	content: string;
	rating: number | null;
	country: string | null;
}

export interface ModuleStats {
	videos: number;
	minutes: number;
	/** Article lessons, which the legacy pages called slide tutorials. */
	slides: number;
}

/** Counts and whole minutes of one module's published lessons. */
export function moduleStats(module: Pick<MarketingModule, 'lessons'>): ModuleStats {
	const seconds = module.lessons.reduce((sum, lesson) => sum + (lesson.durationSeconds ?? 0), 0);
	return {
		videos: module.lessons.filter((lesson) => lesson.kind === 'video').length,
		minutes: Math.round(seconds / 60),
		slides: module.lessons.filter((lesson) => lesson.kind === 'article').length
	};
}

/** Slide tutorials (article lessons) across the outline. */
export function slideCount(outline: Pick<MarketingOutline, 'modules'>): number {
	return outline.modules.reduce((sum, module) => sum + moduleStats(module).slides, 0);
}

/** All modules, bonus included, as the legacy pages counted them. */
export function moduleCount(totals: OutlineTotals): number {
	return totals.modules + totals.bonusModules;
}

/**
 * Teaching time rounded to the nearest half hour, written as legacy did
 * ("4½ hrs"); under a quarter of an hour it falls back to minutes.
 */
export function approxHours(minutes: number, unit: 'hrs' | 'hours' = 'hrs'): string {
	const halves = Math.round(minutes / 30);
	if (halves === 0) return `${minutes} min`;
	const whole = Math.floor(halves / 2);
	const half = halves % 2 === 1 ? '½' : '';
	return `${whole === 0 ? '' : whole}${half} ${unit}`;
}

/** Where every enrolment call to action points: the flagship's product page. */
export function productHref(product: Pick<OfferProduct, 'slug'> | null): string {
	return product ? `/products/${product.slug}` : '/catalogue';
}
