/** The columns a sale decision needs; `products` rows and catalogue cards both satisfy it. */
export interface Priced {
	price: number;
	sale_price: number | null;
	sale_starts_at: string | null;
	sale_ends_at: string | null;
}

export interface EffectivePrice {
	/** The full price in pence, always shown (struck through while on sale). */
	listPrice: number;
	/** What the buyer pays now, in pence. */
	price: number;
	onSale: boolean;
	/** When the running sale ends; null when not on sale or open-ended. */
	saleEndsAt: string | null;
}

/**
 * A sale applies when `sale_price` is set and `now` lies inside
 * `[sale_starts_at ?? -∞, sale_ends_at ?? +∞)`. Pure: no clock of its own.
 */
export function effectivePrice(product: Priced, now: Date): EffectivePrice {
	const listPrice = product.price;
	if (product.sale_price === null) {
		return { listPrice, price: listPrice, onSale: false, saleEndsAt: null };
	}
	const time = now.getTime();
	const started = product.sale_starts_at === null || Date.parse(product.sale_starts_at) <= time;
	const ended = product.sale_ends_at !== null && Date.parse(product.sale_ends_at) <= time;
	if (!started || ended) {
		return { listPrice, price: listPrice, onSale: false, saleEndsAt: null };
	}
	return {
		listPrice,
		price: product.sale_price,
		onSale: true,
		saleEndsAt: product.sale_ends_at
	};
}
