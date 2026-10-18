import { eq } from 'drizzle-orm';
import type { Db } from '../index.ts';
import { order_items, orders, payments, products, promo_redemptions } from '../schema/index.ts';
import { requireFlagshipProduct } from './flagship-product.ts';

export interface OrderCounts {
	orders_inserted: number;
	order_items_inserted: number;
	promo_redemptions_inserted: number;
}

type OrderStatus = (typeof orders.$inferInsert)['status'];

function orderStatusFor(status: (typeof payments.$inferSelect)['status']): OrderStatus {
	if (status === 'succeeded') return 'paid';
	if (status === 'refunded') return 'refunded';
	return 'pending';
}

/**
 * One `orders` + `order_items` row per legacy `payments` row, plus a
 * `promo_redemptions` row where the payment used a code. The order reuses the
 * payment's id and copies `stripe_checkout_session_id`, so an order that
 * already exists (by id or by session id) is skipped: re-runs insert nothing.
 * Amounts: `total = amount`, `discount_total = discount_amount`,
 * `subtotal = total + discount_total`; the single item is the flagship product
 * with the same amounts, and a refunded payment marks the item fully refunded.
 */
export async function backfillOrders(db: Db): Promise<OrderCounts> {
	const flagship = await requireFlagshipProduct(db);
	const [product] = await db
		.select({ id: products.id, title: products.title })
		.from(products)
		.where(eq(products.id, flagship.id));
	if (!product) throw new Error('flagship product vanished during backfill');

	const rows = await db.select().from(payments).orderBy(payments.created_at, payments.id);
	const counts: OrderCounts = {
		orders_inserted: 0,
		order_items_inserted: 0,
		promo_redemptions_inserted: 0
	};

	for (const payment of rows) {
		const status = orderStatusFor(payment.status);
		const inserted = await db
			.insert(orders)
			.values({
				id: payment.id,
				user_id: payment.user_id,
				status,
				currency: payment.currency,
				subtotal: payment.amount + payment.discount_amount,
				discount_total: payment.discount_amount,
				total: payment.amount,
				stripe_checkout_session_id: payment.stripe_checkout_session_id,
				stripe_payment_intent_id: payment.stripe_payment_intent_id,
				promo_code_id: payment.promo_code_id,
				created_at: payment.created_at,
				paid_at: status === 'pending' ? null : payment.created_at
			})
			.onConflictDoNothing()
			.returning({ id: orders.id });
		const order = inserted[0];
		if (!order) continue;
		counts.orders_inserted += 1;

		await db.insert(order_items).values({
			order_id: order.id,
			product_id: product.id,
			product_title: product.title,
			list_price: payment.amount + payment.discount_amount,
			unit_price: payment.amount,
			discount_amount: payment.discount_amount,
			refunded_amount: status === 'refunded' ? payment.amount : 0
		});
		counts.order_items_inserted += 1;

		if (payment.promo_code_id) {
			await db.insert(promo_redemptions).values({
				promo_code_id: payment.promo_code_id,
				order_id: order.id,
				user_id: payment.user_id,
				discount_total: payment.discount_amount,
				created_at: payment.created_at
			});
			counts.promo_redemptions_inserted += 1;
		}
	}

	return counts;
}
