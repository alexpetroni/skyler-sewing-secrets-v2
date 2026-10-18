import { createHmac, timingSafeEqual } from 'node:crypto';
import * as v from 'valibot';
import type { Logger } from '#lib/server/platform/index.ts';
import {
	CART_MAX_ITEMS,
	cartStateSchema,
	type cartRemovalReasons
} from '#lib/shared/schemas/commerce.ts';
import type { CatalogProduct, CatalogService } from '../catalog/index.ts';
import type { EntitlementService } from '../entitlements/index.ts';
import { computeQuote, type PromoRejection, type Quote, type QuoteLine } from './pricing.ts';
import type { PromoService } from './promo.ts';

/**
 * The cart lives in a signed cookie: product ids in the order they were added
 * and at most one code. The server resolves it against the catalogue and the
 * viewer's entitlements on every render, so stale or tampered state can only
 * ever lead to an emptier cart.
 */
export interface CartState {
	/** Product ids, insertion order, at most `CART_MAX_ITEMS`. */
	items: string[];
	promoCode: string | null;
	/**
	 * Removals the buyer has not been shown yet (the flash): `quote` reports
	 * them and the cart page clears them with `acknowledgeRemovals`.
	 */
	removed?: CartRemoval[];
}

export const CART_COOKIE_NAME = 'cart';
export const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** `cookies.set(CART_COOKIE_NAME, value, cartCookieOptions(!dev))`. */
export function cartCookieOptions(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		maxAge: CART_COOKIE_MAX_AGE
	};
}

/** The parts of SvelteKit's `Cookies` the cart cookie needs. */
export interface CartCookieJar {
	get(name: string): string | undefined;
	set(name: string, value: string, options: ReturnType<typeof cartCookieOptions>): void;
}

/** Reads and writes the signed cart cookie; `Services.commerce.cartCookie`. */
export interface CartCookie {
	/** Never throws; anything but a valid signed cart reads as empty. No database. */
	read(cookies: Pick<CartCookieJar, 'get'>): CartState;
	write(cookies: Pick<CartCookieJar, 'set'>, state: CartState): void;
}

export function createCartCookie({
	secret,
	secure
}: {
	secret: string;
	secure: boolean;
}): CartCookie {
	return {
		read: (cookies) => parseCart(cookies.get(CART_COOKIE_NAME), secret),
		write: (cookies, state) =>
			cookies.set(CART_COOKIE_NAME, serializeCart(state, secret), cartCookieOptions(secure))
	};
}

export const emptyCart = (): CartState => ({ items: [], promoCode: null });

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('hex');
}

/** `base64url(json).hmacHex` */
export function serializeCart(state: CartState, secret: string): string {
	const payload = Buffer.from(JSON.stringify(normalise(state)), 'utf8').toString('base64url');
	return `${payload}.${sign(payload, secret)}`;
}

/**
 * Never throws: a missing cookie, a bad signature, malformed JSON or an
 * unexpected shape all read as an empty cart. More than `CART_MAX_ITEMS`
 * ids are truncated; duplicates are dropped.
 */
export function parseCart(cookieValue: string | undefined | null, secret: string): CartState {
	if (!cookieValue) return emptyCart();
	const dot = cookieValue.lastIndexOf('.');
	if (dot <= 0) return emptyCart();
	const payload = cookieValue.slice(0, dot);
	const given = Buffer.from(cookieValue.slice(dot + 1), 'utf8');
	const expected = Buffer.from(sign(payload, secret), 'utf8');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return emptyCart();
	let json: unknown;
	try {
		json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return emptyCart();
	}
	const parsed = v.safeParse(cartStateSchema, json);
	return parsed.success ? normalise(parsed.output) : emptyCart();
}

function normalise(state: CartState): CartState {
	const removed = (state.removed ?? []).slice(0, CART_MAX_ITEMS);
	return {
		items: [...new Set(state.items)].slice(0, CART_MAX_ITEMS),
		promoCode: state.promoCode,
		...(removed.length > 0 ? { removed } : {})
	};
}

/** Appends once; a full cart ignores the new id. */
export function addItem(state: CartState, productId: string): CartState {
	if (state.items.includes(productId) || state.items.length >= CART_MAX_ITEMS) return state;
	return { ...state, items: [...state.items, productId] };
}

export function removeItem(state: CartState, productId: string): CartState {
	return { ...state, items: state.items.filter((id) => id !== productId) };
}

export function setPromo(state: CartState, promoCode: string | null): CartState {
	return { ...state, promoCode };
}

export function clear(): CartState {
	return emptyCart();
}

export type CartRemovalReason = (typeof cartRemovalReasons)[number];

export interface CartRemoval {
	productId: string;
	reason: CartRemovalReason;
}

/**
 * The state after a render has explained `quote.removed`: only the quoted
 * lines stay, and no notice is pending, so each removal is shown once.
 */
export function acknowledgeRemovals(
	state: CartState,
	quote: { lines: readonly Pick<CartLine, 'productId'>[] }
): CartState {
	return { items: quote.lines.map((line) => line.productId), promoCode: state.promoCode };
}

/** A purchasable line as the cart page shows it, priced for `now`. */
export interface CartLine {
	productId: string;
	slug: string;
	title: string;
	kind: CatalogProduct['kind'];
	coverImageUrl: string | null;
	listPrice: number;
	effectivePrice: number;
	onSale: boolean;
	saleEndsAt: string | null;
}

export interface ResolvedCart {
	lines: CartLine[];
	removed: CartRemoval[];
}

export interface CartQuote extends Omit<Quote, 'lines'> {
	lines: (CartLine & Pick<QuoteLine, 'discount' | 'unitAmount'>)[];
	removed: CartRemoval[];
	/** The code in the cart as entered, applied or not; null when none. */
	promoCode: string | null;
	rejection: PromoRejection | null;
	/** The flagship is absent and the total has reached `FLAGSHIP_SUGGEST_RATIO` of its price. */
	suggestFlagship: boolean;
}

/** The viewer whose ownership the cart is resolved against; null when signed out. */
export type CartViewer = { id: string } | null;

export type CartAddResult = { ok: true; state: CartState } | { ok: false; reason: 'unpublished' };

export interface CartService {
	/**
	 * Products in the cookie against the catalogue and the viewer: unpublished
	 * and owned products go, the flagship displaces everything it includes,
	 * duplicates collapse. Order is preserved; every removal is explained.
	 */
	resolve(state: CartState, viewer: CartViewer, now?: Date): Promise<ResolvedCart>;
	/** `resolve` + the code's validity + the arithmetic, plus the upsell hint. */
	quote(state: CartState, viewer: CartViewer, now?: Date): Promise<CartQuote>;
	/**
	 * Adds a published product. One the viewer already owns stays out of the
	 * items and is queued as an `owned` notice for the next quote instead; an
	 * unknown or unpublished product is refused.
	 */
	add(state: CartState, productId: string, viewer: CartViewer, now?: Date): Promise<CartAddResult>;
}

export interface CreateCartServiceDeps {
	catalog: CatalogService;
	entitlements: EntitlementService;
	promo: PromoService;
	log: Logger;
}

/** Suggest the course once the cart is worth this share of its price. */
export const FLAGSHIP_SUGGEST_RATIO = 0.6;

function toLine(product: CatalogProduct): CartLine {
	return {
		productId: product.id,
		slug: product.slug,
		title: product.title,
		kind: product.kind,
		coverImageUrl: product.cover_image_url,
		listPrice: product.pricing.listPrice,
		effectivePrice: product.pricing.price,
		onSale: product.pricing.onSale,
		saleEndsAt: product.pricing.saleEndsAt
	};
}

export function createCartService({
	catalog,
	entitlements,
	promo,
	log
}: CreateCartServiceDeps): CartService {
	async function ownedBy(viewer: CartViewer): Promise<{ allAccess: boolean; ids: Set<string> }> {
		if (!viewer) return { allAccess: false, ids: new Set() };
		const [allAccess, ids] = await Promise.all([
			entitlements.hasAllAccess(viewer.id),
			entitlements.ownedProductIds(viewer.id)
		]);
		return { allAccess, ids: new Set(ids) };
	}

	async function resolveWith(
		state: CartState,
		viewer: CartViewer,
		published: CatalogProduct[]
	): Promise<ResolvedCart> {
		const byId = new Map(published.map((product) => [product.id, product]));
		const owned = await ownedBy(viewer);
		const removed: CartRemoval[] = [];
		const kept: CatalogProduct[] = [];
		const seen = new Set<string>();

		for (const productId of state.items) {
			if (seen.has(productId)) {
				removed.push({ productId, reason: 'duplicate' });
				continue;
			}
			seen.add(productId);
			const product = byId.get(productId);
			if (!product) {
				removed.push({ productId, reason: 'unpublished' });
				continue;
			}
			// An all-access owner already has every product the catalogue sells.
			if (owned.allAccess || owned.ids.has(productId)) {
				removed.push({ productId, reason: 'owned' });
				continue;
			}
			kept.push(product);
		}

		const flagship = kept.find((product) => product.access_scope === 'all');
		const lines = flagship
			? kept.filter((product) => {
					if (product.id === flagship.id) return true;
					removed.push({ productId: product.id, reason: 'included_in_course' });
					return false;
				})
			: kept;

		if (removed.length > 0) {
			log.debug('cart items removed', { count: removed.length });
		}
		return { lines: lines.map(toLine), removed };
	}

	return {
		async resolve(state, viewer, now = new Date()) {
			return resolveWith(state, viewer, await catalog.listPublished({ now }));
		},

		async add(state, productId, viewer, now = new Date()) {
			const published = await catalog.listPublished({ now });
			const { removed } = await resolveWith(
				{ items: [productId], promoCode: null },
				viewer,
				published
			);
			const reason = removed[0]?.reason;
			if (reason === 'unpublished') return { ok: false, reason };
			if (reason === 'owned') {
				const notice: CartRemoval = { productId, reason };
				return { ok: true, state: { ...state, removed: [...(state.removed ?? []), notice] } };
			}
			return { ok: true, state: addItem(state, productId) };
		},

		async quote(state, viewer, now = new Date()) {
			const published = await catalog.listPublished({ now });
			const { lines, removed } = await resolveWith(state, viewer, published);

			let rule = null;
			let rejection: PromoRejection | null = null;
			if (state.promoCode) {
				const found = await promo.findValidByCode(state.promoCode, {
					userId: viewer?.id,
					lines,
					now
				});
				if (found.ok) rule = found.rule;
				else rejection = found.reason;
			}

			const quote = computeQuote({ lines, promo: rule });

			const flagship = published.find((product) => product.access_scope === 'all');
			const flagshipInCart = lines.some((line) => line.productId === flagship?.id);
			const suggestFlagship =
				flagship !== undefined &&
				!flagshipInCart &&
				lines.length > 0 &&
				quote.total >= Math.ceil(flagship.pricing.price * FLAGSHIP_SUGGEST_RATIO);

			return {
				// `computeQuote` keeps the order, one quoted line per input line.
				lines: quote.lines.map((quoted, i) => ({
					...lines[i],
					discount: quoted.discount,
					unitAmount: quoted.unitAmount
				})),
				// Notices queued by `add` come first, then what this render removed.
				removed: [...(state.removed ?? []), ...removed],
				subtotal: quote.subtotal,
				discountTotal: quote.discountTotal,
				total: quote.total,
				promo: quote.promo,
				promoCode: state.promoCode,
				rejection: rejection ?? quote.rejection,
				suggestFlagship
			};
		}
	};
}
