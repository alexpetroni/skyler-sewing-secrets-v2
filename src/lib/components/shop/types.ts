/**
 * The shapes the shop components render. Structural, so the shop loads pass
 * catalogue products and cart quote lines straight in.
 */
export type ProductKind = 'course' | 'bundle' | 'single';

export interface ShopPricing {
	price: number;
	listPrice: number;
	onSale: boolean;
	saleEndsAt: string | null;
}

/** A published product as a catalogue card shows it. */
export interface ShopProduct {
	id: string;
	slug: string;
	kind: ProductKind;
	title: string;
	tagline: string | null;
	coverImageUrl: string | null;
	itemCount: number;
	durationSeconds: number;
	pricing: ShopPricing;
}

/** A lesson a product page lists. */
export interface ShopLesson {
	id: string;
	title: string;
	durationSeconds: number | null;
	/** Set for free previews only: anyone may watch them. */
	previewHref: string | null;
}

/** One quoted cart line. */
export interface ShopCartLine {
	productId: string;
	slug: string;
	title: string;
	kind: ProductKind;
	coverImageUrl: string | null;
	listPrice: number;
	effectivePrice: number;
	onSale: boolean;
	saleEndsAt: string | null;
	/** Pence the code takes off this line. */
	discount: number;
	unitAmount: number;
}

export const KIND_LABELS: Record<ProductKind, string> = {
	course: 'Full course',
	bundle: 'Bundle',
	single: 'Video'
};
