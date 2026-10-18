import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	pgEnum,
	index,
	primaryKey
} from 'drizzle-orm/pg-core';
import { lessons } from './content.ts';

export const productKind = pgEnum('product_kind', ['course', 'bundle', 'single']);
export const accessScope = pgEnum('access_scope', ['all', 'items']);

// Everything that can be bought. Exactly one row has `access_scope = 'all'`:
// the flagship course, whose price replaces `pricing_config`. Bundles and
// singles list their lessons in `product_items`. Prices are integer pence.
export const products = pgTable(
	'products',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		slug: text('slug').notNull().unique(),
		kind: productKind('kind').notNull(),
		access_scope: accessScope('access_scope').notNull().default('items'),
		title: text('title').notNull(),
		tagline: text('tagline'),
		description_md: text('description_md'),
		description_html: text('description_html'),
		cover_image_url: text('cover_image_url'),
		price: integer('price').notNull(),
		currency: text('currency').notNull().default('gbp'),
		sale_price: integer('sale_price'),
		sale_starts_at: timestamp('sale_starts_at', { withTimezone: true, mode: 'string' }),
		sale_ends_at: timestamp('sale_ends_at', { withTimezone: true, mode: 'string' }),
		is_published: boolean('is_published').notNull().default(false),
		is_featured: boolean('is_featured').notNull().default(false),
		sort_order: integer('sort_order').notNull().default(0),
		stripe_product_id: text('stripe_product_id').unique(),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('idx_products_published').on(t.is_published, t.sort_order),
		index('idx_products_kind').on(t.kind)
	]
);

export const product_items = pgTable(
	'product_items',
	{
		product_id: uuid('product_id')
			.notNull()
			.references(() => products.id, { onDelete: 'cascade' }),
		lesson_id: uuid('lesson_id')
			.notNull()
			.references(() => lessons.id, { onDelete: 'cascade' }),
		sort_order: integer('sort_order').notNull().default(0)
	},
	(t) => [
		primaryKey({ columns: [t.product_id, t.lesson_id] }),
		index('idx_product_items_lesson').on(t.lesson_id)
	]
);
