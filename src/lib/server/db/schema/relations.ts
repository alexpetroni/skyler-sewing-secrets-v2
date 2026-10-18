import { relations } from 'drizzle-orm';
import { users, twoFactors } from './auth.ts';
import { profiles } from './profiles.ts';
import { media_assets } from './media.ts';
import { modules, lessons, lesson_resources, user_progress } from './content.ts';
import { blog_posts, testimonials } from './marketing.ts';
import { promo_codes, payments } from './legacy-commerce.ts';
import { products, product_items } from './catalog.ts';
import { orders, order_items, promo_code_products, promo_redemptions } from './commerce.ts';
import { entitlements } from './entitlements.ts';
import { audit_log } from './ops.ts';

// =============================================
// Relations (for db.query relational queries, replacing
// PostgREST nested embeds like select('*, lessons(*)'))
// =============================================
export const usersRelations = relations(users, ({ one, many }) => ({
	profile: one(profiles, { fields: [users.id], references: [profiles.id] }),
	twoFactors: many(twoFactors)
}));

export const twoFactorsRelations = relations(twoFactors, ({ one }) => ({
	user: one(users, { fields: [twoFactors.userId], references: [users.id] })
}));

export const modulesRelations = relations(modules, ({ many }) => ({
	lessons: many(lessons)
}));

export const mediaAssetsRelations = relations(media_assets, ({ many }) => ({
	lessons: many(lessons)
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
	module: one(modules, { fields: [lessons.module_id], references: [modules.id] }),
	media_asset: one(media_assets, {
		fields: [lessons.media_asset_id],
		references: [media_assets.id]
	}),
	resources: many(lesson_resources),
	progress: many(user_progress),
	product_items: many(product_items)
}));

export const lessonResourcesRelations = relations(lesson_resources, ({ one }) => ({
	lesson: one(lessons, { fields: [lesson_resources.lesson_id], references: [lessons.id] })
}));

export const userProgressRelations = relations(user_progress, ({ one }) => ({
	lesson: one(lessons, { fields: [user_progress.lesson_id], references: [lessons.id] }),
	profile: one(profiles, { fields: [user_progress.user_id], references: [profiles.id] })
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
	user: one(users, { fields: [profiles.id], references: [users.id] }),
	progress: many(user_progress),
	payments: many(payments),
	testimonials: many(testimonials),
	orders: many(orders),
	entitlements: many(entitlements, { relationName: 'entitlement_owner' }),
	granted_entitlements: many(entitlements, { relationName: 'entitlement_granter' }),
	promo_redemptions: many(promo_redemptions),
	audit_entries: many(audit_log)
}));

export const blogPostsRelations = relations(blog_posts, ({ one }) => ({
	author: one(profiles, { fields: [blog_posts.author_id], references: [profiles.id] })
}));

export const testimonialsRelations = relations(testimonials, ({ one }) => ({
	profile: one(profiles, { fields: [testimonials.user_id], references: [profiles.id] })
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
	profile: one(profiles, { fields: [payments.user_id], references: [profiles.id] }),
	promo_code: one(promo_codes, { fields: [payments.promo_code_id], references: [promo_codes.id] })
}));

export const promoCodesRelations = relations(promo_codes, ({ many }) => ({
	payments: many(payments),
	products: many(promo_code_products),
	redemptions: many(promo_redemptions),
	orders: many(orders)
}));

export const productsRelations = relations(products, ({ many }) => ({
	items: many(product_items),
	order_items: many(order_items),
	entitlements: many(entitlements),
	promo_codes: many(promo_code_products)
}));

export const productItemsRelations = relations(product_items, ({ one }) => ({
	product: one(products, { fields: [product_items.product_id], references: [products.id] }),
	lesson: one(lessons, { fields: [product_items.lesson_id], references: [lessons.id] })
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	profile: one(profiles, { fields: [orders.user_id], references: [profiles.id] }),
	promo_code: one(promo_codes, { fields: [orders.promo_code_id], references: [promo_codes.id] }),
	items: many(order_items),
	redemption: one(promo_redemptions, {
		fields: [orders.id],
		references: [promo_redemptions.order_id]
	})
}));

export const orderItemsRelations = relations(order_items, ({ one, many }) => ({
	order: one(orders, { fields: [order_items.order_id], references: [orders.id] }),
	product: one(products, { fields: [order_items.product_id], references: [products.id] }),
	entitlements: many(entitlements)
}));

export const promoCodeProductsRelations = relations(promo_code_products, ({ one }) => ({
	promo_code: one(promo_codes, {
		fields: [promo_code_products.promo_code_id],
		references: [promo_codes.id]
	}),
	product: one(products, { fields: [promo_code_products.product_id], references: [products.id] })
}));

export const promoRedemptionsRelations = relations(promo_redemptions, ({ one }) => ({
	promo_code: one(promo_codes, {
		fields: [promo_redemptions.promo_code_id],
		references: [promo_codes.id]
	}),
	order: one(orders, { fields: [promo_redemptions.order_id], references: [orders.id] }),
	profile: one(profiles, { fields: [promo_redemptions.user_id], references: [profiles.id] })
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
	profile: one(profiles, {
		fields: [entitlements.user_id],
		references: [profiles.id],
		relationName: 'entitlement_owner'
	}),
	product: one(products, { fields: [entitlements.product_id], references: [products.id] }),
	order_item: one(order_items, {
		fields: [entitlements.order_item_id],
		references: [order_items.id]
	}),
	granted_by_profile: one(profiles, {
		fields: [entitlements.granted_by],
		references: [profiles.id],
		relationName: 'entitlement_granter'
	})
}));

export const auditLogRelations = relations(audit_log, ({ one }) => ({
	actor: one(profiles, { fields: [audit_log.actor_id], references: [profiles.id] })
}));
