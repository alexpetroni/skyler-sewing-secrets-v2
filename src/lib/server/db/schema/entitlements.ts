import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles.ts';
import { products } from './catalog.ts';
import { order_items } from './commerce.ts';

export const entitlementSource = pgEnum('entitlement_source', [
	'purchase',
	'migration',
	'admin_grant',
	'gift'
]);

// What a user owns. A row with `revoked_at IS NULL` is active; the partial
// unique index allows one active entitlement per (user, product) while
// keeping revoked rows as history.
export const entitlements = pgTable(
	'entitlements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		user_id: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		product_id: uuid('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'restrict' }),
		order_item_id: uuid('order_item_id').references(() => order_items.id, {
			onDelete: 'set null'
		}),
		source: entitlementSource('source').notNull(),
		granted_at: timestamp('granted_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		revoked_at: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
		revoke_reason: text('revoke_reason'),
		granted_by: uuid('granted_by').references(() => profiles.id, { onDelete: 'set null' })
	},
	(t) => [
		uniqueIndex('idx_entitlements_active')
			.on(t.user_id, t.product_id)
			.where(sql`${t.revoked_at} IS NULL`),
		index('idx_entitlements_user_revoked').on(t.user_id, t.revoked_at),
		index('idx_entitlements_product').on(t.product_id),
		index('idx_entitlements_order_item').on(t.order_item_id)
	]
);
