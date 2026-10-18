import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	index,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles.ts';

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
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
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
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
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
	created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
		.notNull()
		.defaultNow(),
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
	subscribed_at: timestamp('subscribed_at', { withTimezone: true, mode: 'string' })
		.notNull()
		.defaultNow(),
	unsubscribed_at: timestamp('unsubscribed_at', { withTimezone: true, mode: 'string' })
});
