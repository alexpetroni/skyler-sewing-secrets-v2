import * as pricing from './pricing.ts';

export { pricing };
export {
	acknowledgeRemovals,
	addItem,
	CART_COOKIE_MAX_AGE,
	CART_COOKIE_NAME,
	cartCookieOptions,
	clear,
	createCartCookie,
	createCartService,
	emptyCart,
	FLAGSHIP_SUGGEST_RATIO,
	parseCart,
	removeItem,
	serializeCart,
	setPromo,
	type CartAddResult,
	type CartCookie,
	type CartCookieJar,
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
	createOrderService,
	EmptyCartError,
	ORDER_TTL_MS,
	PromoInvalidError,
	type CreateOrderServiceDeps,
	type CreatePendingOrderInput,
	type Order,
	type OrderItem,
	type OrderService,
	type OrderStatus,
	type OrderSummary,
	type OrderSummaryItem,
	type OrderWithItems,
	type StartCheckoutInput
} from './orders.ts';
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
	cartCookie: import('./cart.ts').CartCookie;
	orders: import('./orders.ts').OrderService;
}
