import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	pgEnum,
	uniqueIndex,
	index,
	unique,
	check
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

// =============================================
// Enums
// =============================================
export const discountType = pgEnum('discount_type', ['percentage', 'fixed']);
export const lessonType = pgEnum('lesson_type', ['video', 'article']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'succeeded', 'failed', 'refunded']);

// =============================================
// Better Auth tables (camelCase property names are
// required by the Better Auth drizzle adapter; columns
// stay snake_case in the database)
// =============================================
export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().default(''),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_sessions_user').on(t.userId)]
);

export const accounts = pgTable(
	'accounts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// For 'credential' accounts accountId = userId and password holds the
		// bcrypt hash (imported unchanged from Supabase auth.users).
		// For 'google' accounts accountId = the Google `sub` claim
		// (imported from Supabase auth.identities.provider_id).
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('idx_accounts_user').on(t.userId),
		uniqueIndex('idx_accounts_provider').on(t.providerId, t.accountId)
	]
);

export const verifications = pgTable(
	'verifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('idx_verifications_identifier').on(t.identifier)]
);

// =============================================
// App tables (snake_case property names on purpose:
// they match the DB columns and the shapes the Svelte
// components already consume, e.g. profile.is_member)
// =============================================
export const profiles = pgTable(
	'profiles',
	{
		id: uuid('id')
			.primaryKey()
			.references(() => users.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		full_name: text('full_name'),
		avatar_url: text('avatar_url'),
		is_member: boolean('is_member').notNull().default(false),
		is_admin: boolean('is_admin').notNull().default(false),
		is_suspended: boolean('is_suspended').notNull().default(false),
		suspended_reason: text('suspended_reason'),
		suspended_at: timestamp('suspended_at', { withTimezone: true, mode: 'string' }),
		stripe_customer_id: text('stripe_customer_id').unique(),
		member_since: timestamp('member_since', { withTimezone: true, mode: 'string' }),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		index('idx_profiles_email').on(t.email),
		index('idx_profiles_is_member').on(t.is_member),
		index('idx_profiles_is_admin').on(t.is_admin)
	]
);

export const pricing_config = pgTable('pricing_config', {
	id: uuid('id').primaryKey().defaultRandom(),
	// UNIQUE added vs the Supabase schema: the seeder upserts on name
	name: text('name').notNull().default('default').unique(),
	base_price: integer('base_price').notNull().default(14900),
	currency: text('currency').notNull().default('gbp'),
	is_active: boolean('is_active').notNull().default(true),
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
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
		valid_from: timestamp('valid_from', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		valid_until: timestamp('valid_until', { withTimezone: true, mode: 'string' }),
		is_active: boolean('is_active').notNull().default(true),
		created_by: uuid('created_by').references(() => profiles.id),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		index('idx_promo_codes_code').on(t.code),
		index('idx_promo_codes_active').on(t.is_active, t.valid_from, t.valid_until)
	]
);

export const modules = pgTable(
	'modules',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		slug: text('slug').notNull().unique(),
		description: text('description'),
		thumbnail_url: text('thumbnail_url'),
		order_index: integer('order_index').notNull().default(0),
		is_published: boolean('is_published').notNull().default(false),
		is_bonus: boolean('is_bonus').notNull().default(false),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		index('idx_modules_order').on(t.order_index),
		index('idx_modules_published').on(t.is_published),
		index('idx_modules_slug').on(t.slug)
	]
);

export const lessons = pgTable(
	'lessons',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		module_id: uuid('module_id')
			.notNull()
			.references(() => modules.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		slug: text('slug').notNull(),
		description: text('description'),
		content: text('content'),
		video_url: text('video_url'),
		thumbnail_url: text('thumbnail_url'),
		lesson_type: lessonType('lesson_type').notNull().default('video'),
		order_index: integer('order_index').notNull().default(0),
		duration_minutes: integer('duration_minutes'),
		is_free_preview: boolean('is_free_preview').notNull().default(false),
		is_published: boolean('is_published').notNull().default(false),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		unique('lessons_module_id_slug_unique').on(t.module_id, t.slug),
		index('idx_lessons_module').on(t.module_id),
		index('idx_lessons_order').on(t.order_index),
		index('idx_lessons_slug').on(t.module_id, t.slug)
	]
);

export const lesson_resources = pgTable('lesson_resources', {
	id: uuid('id').primaryKey().defaultRandom(),
	lesson_id: uuid('lesson_id')
		.notNull()
		.references(() => lessons.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	file_url: text('file_url').notNull(),
	file_type: text('file_type'),
	file_size_bytes: integer('file_size_bytes'),
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

export const user_progress = pgTable(
	'user_progress',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		user_id: uuid('user_id')
			.notNull()
			.references(() => profiles.id, { onDelete: 'cascade' }),
		lesson_id: uuid('lesson_id')
			.notNull()
			.references(() => lessons.id, { onDelete: 'cascade' }),
		completed: boolean('completed').notNull().default(false),
		completed_at: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
		last_position_seconds: integer('last_position_seconds').notNull().default(0),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		unique('user_progress_user_id_lesson_id_unique').on(t.user_id, t.lesson_id),
		index('idx_user_progress_user').on(t.user_id),
		index('idx_user_progress_lesson').on(t.lesson_id)
	]
);

export const blog_posts = pgTable(
	'blog_posts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		slug: text('slug').notNull().unique(),
		excerpt: text('excerpt'),
		content: text('content').notNull(),
		featured_image_url: text('featured_image_url'),
		author_id: uuid('author_id').references(() => profiles.id, { onDelete: 'set null' }),
		is_published: boolean('is_published').notNull().default(false),
		published_at: timestamp('published_at', { withTimezone: true, mode: 'string' }),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		index('idx_blog_posts_published').on(t.is_published, t.published_at),
		index('idx_blog_posts_slug').on(t.slug)
	]
);

export const testimonials = pgTable(
	'testimonials',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		author_name: text('author_name').notNull(),
		author_title: text('author_title'),
		author_avatar_url: text('author_avatar_url'),
		content: text('content').notNull(),
		rating: integer('rating'),
		is_featured: boolean('is_featured').notNull().default(false),
		order_index: integer('order_index').notNull().default(0),
		is_published: boolean('is_published').notNull().default(false),
		user_id: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
		country: text('country'),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
	},
	(t) => [
		index('idx_testimonials_featured').on(t.is_featured, t.order_index),
		index('idx_testimonials_user').on(t.user_id),
		check('testimonials_rating_check', sql`${t.rating} >= 1 AND ${t.rating} <= 5`)
	]
);

export const faq_items = pgTable('faq_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	question: text('question').notNull(),
	answer: text('answer').notNull(),
	category: text('category'),
	order_index: integer('order_index').notNull().default(0),
	is_published: boolean('is_published').notNull().default(true),
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

export const contact_submissions = pgTable('contact_submissions', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	subject: text('subject'),
	message: text('message').notNull(),
	is_read: boolean('is_read').notNull().default(false),
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

export const newsletter_subscribers = pgTable('newsletter_subscribers', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	is_active: boolean('is_active').notNull().default(true),
	subscribed_at: timestamp('subscribed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
	unsubscribed_at: timestamp('unsubscribed_at', { withTimezone: true, mode: 'string' })
});

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

export const site_settings = pgTable('site_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull().default(''),
	updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});

// =============================================
// Relations (for db.query relational queries, replacing
// PostgREST nested embeds like select('*, lessons(*)'))
// =============================================
export const modulesRelations = relations(modules, ({ many }) => ({
	lessons: many(lessons)
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
	module: one(modules, { fields: [lessons.module_id], references: [modules.id] }),
	resources: many(lesson_resources),
	progress: many(user_progress)
}));

export const lessonResourcesRelations = relations(lesson_resources, ({ one }) => ({
	lesson: one(lessons, { fields: [lesson_resources.lesson_id], references: [lessons.id] })
}));

export const userProgressRelations = relations(user_progress, ({ one }) => ({
	lesson: one(lessons, { fields: [user_progress.lesson_id], references: [lessons.id] }),
	profile: one(profiles, { fields: [user_progress.user_id], references: [profiles.id] })
}));

export const profilesRelations = relations(profiles, ({ many }) => ({
	progress: many(user_progress),
	payments: many(payments),
	testimonials: many(testimonials)
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
	payments: many(payments)
}));
