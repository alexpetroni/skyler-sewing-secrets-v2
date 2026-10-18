import {
	pgTable,
	uuid,
	text,
	integer,
	timestamp,
	pgEnum,
	index,
	primaryKey
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.ts';
import { products } from './catalog.ts';
import { promo_codes } from './legacy-commerce.ts';

export const orderStatus = pgEnum('order_status', [
	'pending',
	'paid',
	'expired',
	'refunded',
	'partially_refunded',
	'disputed'
]);

// Replaces `payments`. One row per Stripe Checkout Session; amounts are pence
// snapshots so later price changes never alter history. `user_id` is RESTRICT:
// an account with orders cannot be deleted by accident.
export const orders = pgTable(
	'orders',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		user_id: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'restrict' }),
		status: orderStatus('status').notNull().default('pending'),
		currency: text('currency').notNull().default('gbp'),
		subtotal: integer('subtotal').notNull(),
		discount_total: integer('discount_total').notNull().default(0),
		total: integer('total').notNull(),
		stripe_checkout_session_id: text('stripe_checkout_session_id').unique(),
		stripe_payment_intent_id: text('stripe_payment_intent_id'),
		promo_code_id: uuid('promo_code_id').references(() => promo_codes.id),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		paid_at: timestamp('paid_at', { withTimezone: true, mode: 'string' }),
		expires_at: timestamp('expires_at', { withTimezone: true, mode: 'string' })
	},
	(t) => [
		index('idx_orders_user').on(t.user_id),
		index('idx_orders_status').on(t.status, t.expires_at),
		index('idx_orders_payment_intent').on(t.stripe_payment_intent_id)
	]
);

export const order_items = pgTable(
	'order_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		order_id: uuid('order_id')
			.notNull()
			.references(() => orders.id, { onDelete: 'cascade' }),
		product_id: uuid('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'restrict' }),
		product_title: text('product_title').notNull(),
		list_price: integer('list_price').notNull(),
		unit_price: integer('unit_price').notNull(),
		discount_amount: integer('discount_amount').notNull().default(0),
		refunded_amount: integer('refunded_amount').notNull().default(0)
	},
	(t) => [index('idx_order_items_order').on(t.order_id)]
);

// Scope of a code with `promo_codes.applies_to = 'products'`.
export const promo_code_products = pgTable(
	'promo_code_products',
	{
		promo_code_id: uuid('promo_code_id')
			.notNull()
			.references(() => promo_codes.id, { onDelete: 'cascade' }),
		product_id: uuid('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.promo_code_id, t.product_id] })]
);

// Usage ledger: `count(*)` per code replaces `promo_codes.current_uses`,
// `order_id` unique means one code per order.
export const promo_redemptions = pgTable(
	'promo_redemptions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		promo_code_id: uuid('promo_code_id')
			.notNull()
			.references(() => promo_codes.id, { onDelete: 'cascade' }),
		order_id: uuid('order_id')
			.notNull()
			.unique()
			.references(() => orders.id, { onDelete: 'cascade' }),
		user_id: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		discount_total: integer('discount_total').notNull(),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [index('idx_promo_redemptions_code_user').on(t.promo_code_id, t.user_id)]
);
