import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	pgEnum,
	index
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.ts';

export const discountType = pgEnum('discount_type', ['percentage', 'fixed']);
export const paymentStatus = pgEnum('payment_status', [
	'pending',
	'succeeded',
	'failed',
	'refunded'
]);

export const pricing_config = pgTable('pricing_config', {
	id: uuid('id').primaryKey().defaultRandom(),
	// UNIQUE added vs the Supabase schema: the seeder upserts on name
	name: text('name').notNull().default('default').unique(),
	base_price: integer('base_price').notNull().default(14900),
	currency: text('currency').notNull().default('gbp'),
	is_active: boolean('is_active').notNull().default(true),
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
		.notNull()
		.defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

export const promo_codes = pgTable(
	'promo_codes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		code: text('code').notNull().unique(),
		description: text('description'),
		discount_type: discountType('discount_type').notNull().default('percentage'),
		discount_value: integer('discount_value').notNull(),
		max_uses: integer('max_uses'),
		current_uses: integer('current_uses').notNull().default(0),
		min_purchase_amount: integer('min_purchase_amount'),
		valid_from: timestamp('valid_from', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		valid_until: timestamp('valid_until', { withTimezone: true, mode: 'string' }),
		is_active: boolean('is_active').notNull().default(true),
		created_by: uuid('created_by').references(() => profiles.id),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('idx_promo_codes_code').on(t.code),
		index('idx_promo_codes_active').on(t.is_active, t.valid_from, t.valid_until)
	]
);

export const payments = pgTable('payments', {
	id: uuid('id').primaryKey().defaultRandom(),
	user_id: uuid('user_id')
		.notNull()
		.references(() => profiles.id, { onDelete: 'cascade' }),
	stripe_payment_intent_id: text('stripe_payment_intent_id').unique(),
	stripe_checkout_session_id: text('stripe_checkout_session_id').unique(),
	amount: integer('amount').notNull(),
	currency: text('currency').notNull().default('gbp'),
	status: paymentStatus('status').notNull().default('pending'),
	promo_code_id: uuid('promo_code_id').references(() => promo_codes.id),
	discount_amount: integer('discount_amount').notNull().default(0),
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});
