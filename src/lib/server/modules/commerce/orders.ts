import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type { Logger, PaymentGateway } from '#lib/server/platform/index.ts';
import { formatPence } from '#lib/shared/money.ts';
import type { CatalogService } from '../catalog/index.ts';
import { DomainError } from '../errors.ts';
import type { CartService, CartState, CartViewer } from './cart.ts';
import type { PromoRejection } from './pricing.ts';
import type { PromoService } from './promo.ts';

const { orders, order_items, promo_codes } = schema;

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof order_items.$inferSelect;
export type OrderStatus = Order['status'];

/** An order with its line snapshots and the code it redeemed, as the routes read it. */
export interface OrderWithItems extends Order {
	items: OrderItem[];
	/** The redeemed code as entered; null when none applied. */
	promoCode: string | null;
}

/** A pending order lives this long before `expireStale` releases its code. */
export const ORDER_TTL_MS = 60 * 60 * 1000;

/** The cart was empty once resolved against the catalogue and the buyer. */
export class EmptyCartError extends DomainError {
	constructor() {
		super('EMPTY_CART', 'The cart is empty');
		this.name = 'EmptyCartError';
	}
}

/** The code in the cart no longer passes the validity predicate. */
export class PromoInvalidError extends DomainError {
	readonly reason: PromoRejection;
	constructor(reason: PromoRejection) {
		super('PROMO_INVALID', `Promo code invalid: ${reason}`);
		this.name = 'PromoInvalidError';
		this.reason = reason;
	}
}

export interface CreatePendingOrderInput {
	userId: string;
	state: CartState;
	/** The buyer the cart is resolved against; normally `{ id: userId }`. */
	viewer: CartViewer;
}

export interface StartCheckoutInput {
	customerEmail: string;
}

/** One item of the success page summary. */
export interface OrderSummaryItem {
	productId: string;
	title: string;
	listPrice: number;
	unitPrice: number;
	discount: number;
	/** The product page, when the product still exists; null otherwise. */
	href: string | null;
}

/** What the success page renders; plain data, no ids the buyer did not already see. */
export interface OrderSummary {
	id: string;
	status: OrderStatus;
	subtotal: number;
	discountTotal: number;
	total: number;
	promoCode: string | null;
	paidAt: string | null;
	items: OrderSummaryItem[];
}

export interface OrderService {
	/**
	 * Quotes the cart and, in one transaction, inserts the order (`pending`,
	 * one hour to pay) with its price snapshots and reserves the code's
	 * redemption. Throws `EmptyCartError`, `PromoInvalidError` or the promo
	 * module's `PromoRejectedError` (cap reached under the lock).
	 */
	createPendingOrder(input: CreatePendingOrderInput): Promise<OrderWithItems>;
	/**
	 * Creates the Stripe Checkout Session (idempotency key = order id) and
	 * stores its id; returns the hosted payment URL. A second call for an
	 * order that already has a session returns that session's URL.
	 */
	startCheckout(orderId: string, input: StartCheckoutInput): Promise<string>;
	getById(orderId: string): Promise<OrderWithItems | null>;
	getByCheckoutSession(sessionId: string): Promise<OrderWithItems | null>;
	/** The user's orders, newest first. */
	listForUser(userId: string): Promise<OrderWithItems[]>;
	/** `pending` → `expired` and the redemption released; false when the order was not pending. */
	expire(orderId: string): Promise<boolean>;
	/** Every `pending` order past `expires_at`; returns the ids it expired. */
	expireStale(now?: Date): Promise<string[]>;
	/** The buyer backs out: their own pending order becomes `expired`. */
	cancelPending(orderId: string, userId: string): Promise<boolean>;
	/** Whether the viewer is the buyer; false when signed out. */
	ownerOf(order: Pick<Order, 'user_id'>, viewer: CartViewer): boolean;
	summaryForSuccessPage(order: OrderWithItems): Promise<OrderSummary>;
}

export interface CreateOrderServiceDeps {
	db: Db;
	cart: CartService;
	promo: PromoService;
	catalog: CatalogService;
	gateway: PaymentGateway;
	log: Logger;
	/** Origin for the success and cancel URLs, without a trailing slash. */
	siteUrl: string;
	now?: () => Date;
}

export function createOrderService({
	db,
	cart,
	promo,
	catalog,
	gateway,
	log,
	siteUrl,
	now = () => new Date()
}: CreateOrderServiceDeps): OrderService {
	const origin = siteUrl.replace(/\/$/, '');

	async function attach(executor: Db | Tx, rows: Order[]): Promise<OrderWithItems[]> {
		if (rows.length === 0) return [];
		const ids = rows.map((row) => row.id);
		const items = await executor
			.select()
			.from(order_items)
			.where(inArray(order_items.order_id, ids));
		const codeIds = rows.flatMap((row) => (row.promo_code_id ? [row.promo_code_id] : []));
		const codes =
			codeIds.length > 0
				? await executor
						.select({ id: promo_codes.id, code: promo_codes.code })
						.from(promo_codes)
						.where(inArray(promo_codes.id, codeIds))
				: [];
		const codeById = new Map(codes.map((row) => [row.id, row.code]));
		return rows.map((row) => ({
			...row,
			items: items.filter((item) => item.order_id === row.id),
			promoCode: row.promo_code_id ? (codeById.get(row.promo_code_id) ?? null) : null
		}));
	}

	async function loadOne(
		executor: Db | Tx,
		where: ReturnType<typeof eq>
	): Promise<OrderWithItems | null> {
		const rows = await executor.select().from(orders).where(where).limit(1);
		const [order] = await attach(executor, rows);
		return order ?? null;
	}

	/** Marks the given pending orders expired and releases their redemptions. */
	async function expireIn(tx: Tx, ids: string[]): Promise<string[]> {
		if (ids.length === 0) return [];
		const expired = await tx
			.update(orders)
			.set({ status: 'expired' })
			.where(and(inArray(orders.id, ids), eq(orders.status, 'pending')))
			.returning({ id: orders.id });
		for (const { id } of expired) {
			await promo.releaseRedemption(tx, id);
		}
		return expired.map((row) => row.id);
	}

	return {
		async createPendingOrder({ userId, state, viewer }) {
			const at = now();
			const quote = await cart.quote(state, viewer, at);
			if (quote.lines.length === 0) throw new EmptyCartError();
			if (quote.rejection) throw new PromoInvalidError(quote.rejection);

			const order = await withTx(db, async (tx) => {
				const [row] = await tx
					.insert(orders)
					.values({
						user_id: userId,
						status: 'pending',
						subtotal: quote.subtotal,
						discount_total: quote.discountTotal,
						total: quote.total,
						promo_code_id: quote.promo?.id ?? null,
						created_at: at.toISOString(),
						expires_at: new Date(at.getTime() + ORDER_TTL_MS).toISOString()
					})
					.returning();
				const items = await tx
					.insert(order_items)
					.values(
						quote.lines.map((line) => ({
							order_id: row.id,
							product_id: line.productId,
							product_title: line.title,
							list_price: line.effectivePrice,
							unit_price: line.unitAmount,
							discount_amount: line.discount
						}))
					)
					.returning();
				if (quote.promo) {
					await promo.reserveRedemption(tx, {
						promoCodeId: quote.promo.id,
						orderId: row.id,
						userId,
						discountTotal: quote.discountTotal,
						now: at
					});
				}
				return { ...row, items, promoCode: quote.promo?.code ?? null };
			});
			log.info('order created', {
				orderId: order.id,
				total: order.total,
				items: order.items.length
			});
			return order;
		},

		async startCheckout(orderId, { customerEmail }) {
			const order = await loadOne(db, eq(orders.id, orderId));
			if (!order) throw new DomainError('ORDER_NOT_FOUND', `Order ${orderId} not found`);

			if (order.stripe_checkout_session_id) {
				const existing = await gateway.retrieveCheckoutSession(order.stripe_checkout_session_id);
				if (!existing.url) {
					throw new DomainError('CHECKOUT_CLOSED', `Checkout for order ${orderId} is closed`);
				}
				return existing.url;
			}
			if (order.status !== 'pending') {
				throw new DomainError('ORDER_NOT_PENDING', `Order ${orderId} is ${order.status}`);
			}

			const session = await gateway.createCheckoutSession({
				orderId: order.id,
				customerEmail,
				lineItems: order.items.map((item) => ({
					name: item.product_title,
					unitAmount: item.unit_price,
					quantity: 1,
					...(item.discount_amount > 0 && order.promoCode
						? {
								description: `Promo ${order.promoCode} applied (−${formatPence(item.discount_amount)})`
							}
						: {})
				})),
				successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
				cancelUrl: `${origin}/checkout/cancel?order=${order.id}`,
				expiresAt: new Date(order.expires_at ?? now().getTime() + ORDER_TTL_MS),
				metadata: { order_id: order.id }
			});
			await db
				.update(orders)
				.set({ stripe_checkout_session_id: session.id })
				.where(eq(orders.id, order.id));
			log.info('checkout session created', { orderId: order.id, sessionId: session.id });
			return session.url;
		},

		getById(orderId) {
			return loadOne(db, eq(orders.id, orderId));
		},

		getByCheckoutSession(sessionId) {
			return loadOne(db, eq(orders.stripe_checkout_session_id, sessionId));
		},

		async listForUser(userId) {
			const rows = await db
				.select()
				.from(orders)
				.where(eq(orders.user_id, userId))
				.orderBy(desc(orders.created_at));
			return attach(db, rows);
		},

		async expire(orderId) {
			const expired = await withTx(db, (tx) => expireIn(tx, [orderId]));
			return expired.length === 1;
		},

		async expireStale(at = now()) {
			const expired = await withTx(db, async (tx) => {
				const stale = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(and(eq(orders.status, 'pending'), lte(orders.expires_at, at.toISOString())));
				return expireIn(
					tx,
					stale.map((row) => row.id)
				);
			});
			if (expired.length > 0) log.info('stale orders expired', { count: expired.length });
			return expired;
		},

		async cancelPending(orderId, userId) {
			const expired = await withTx(db, async (tx) => {
				const [own] = await tx
					.select({ id: orders.id })
					.from(orders)
					.where(
						and(eq(orders.id, orderId), eq(orders.user_id, userId), eq(orders.status, 'pending'))
					)
					.limit(1);
				return expireIn(tx, own ? [own.id] : []);
			});
			return expired.length === 1;
		},

		ownerOf(order, viewer) {
			return viewer !== null && order.user_id === viewer.id;
		},

		async summaryForSuccessPage(order) {
			const items = await Promise.all(
				order.items.map(async (item): Promise<OrderSummaryItem> => {
					const product = await catalog.getById(item.product_id);
					return {
						productId: item.product_id,
						title: item.product_title,
						listPrice: item.list_price,
						unitPrice: item.unit_price,
						discount: item.discount_amount,
						href: product ? `/products/${product.slug}` : null
					};
				})
			);
			return {
				id: order.id,
				status: order.status,
				subtotal: order.subtotal,
				discountTotal: order.discount_total,
				total: order.total,
				promoCode: order.promoCode,
				paidAt: order.paid_at,
				items
			};
		}
	};
}
