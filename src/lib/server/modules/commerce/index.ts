import * as pricing from './pricing.ts';

export { pricing };
export {
	addItem,
	CART_COOKIE_MAX_AGE,
	CART_COOKIE_NAME,
	cartCookieOptions,
	clear,
	createCartService,
	emptyCart,
	FLAGSHIP_SUGGEST_RATIO,
	parseCart,
	removeItem,
	serializeCart,
	setPromo,
	type CartLine,
	type CartQuote,
	type CartRemoval,
	type CartRemovalReason,
	type CartService,
	type CartState,
	type CartViewer,
	type CreateCartServiceDeps,
	type ResolvedCart
} from './cart.ts';
export {
	checkEligibility,
	computeQuote,
	eligibleLines,
	STRIPE_MINIMUM_PENCE,
	type PromoRejection,
	type PromoRule,
	type Quote,
	type QuoteInput,
	type QuoteInputLine,
	type QuoteLine
} from './pricing.ts';
export {
	createPromoService,
	normalizeCode,
	PromoRejectedError,
	type CreatePromoServiceDeps,
	type FindValidParams,
	type FindValidResult,
	type PromoCode,
	type PromoCodeSummary,
	type PromoLine,
	type PromoRedemption,
	type PromoService,
	type RedemptionRow,
	type ReserveRedemptionInput
} from './promo.ts';

/** `Services.commerce`: the pure pricing namespace plus the promo and cart services. */
export interface CommerceServices {
	pricing: typeof pricing;
	promo: import('./promo.ts').PromoService;
	cart: import('./cart.ts').CartService;
}
