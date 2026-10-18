import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	pgEnum,
	index,
	unique,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles.ts';
import { media_assets } from './media.ts';

export const lessonType = pgEnum('lesson_type', ['video', 'article']);
// v2 successor of `lesson_type`; the legacy column stays until the old app is retired.
export const lessonKind = pgEnum('lesson_kind', ['video', 'article']);

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
		// false = a collection that groups standalone videos without making them course content
		is_course_content: boolean('is_course_content').notNull().default(true),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
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
		// null = standalone video sold on its own (`/videos/[slug]`); the legacy
		// NOT NULL was dropped additively in 0002.
		module_id: uuid('module_id').references(() => modules.id, { onDelete: 'cascade' }),
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
		// v2 columns: `media_asset_id` replaces `video_url`, `kind` replaces
		// `lesson_type`, `content_md`/`content_html` replace `content`. The legacy
		// columns (`video_url`, `lesson_type`, `content`, `duration_minutes`) stay
		// until the old app is retired.
		media_asset_id: uuid('media_asset_id').references(() => media_assets.id, {
			onDelete: 'set null'
		}),
		kind: lessonKind('kind').notNull().default('video'),
		content_md: text('content_md'),
		content_html: text('content_html'),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		unique('lessons_module_id_slug_unique').on(t.module_id, t.slug),
		// Standalone videos share one URL namespace, so their slugs are unique globally.
		uniqueIndex('idx_lessons_standalone_slug')
			.on(t.slug)
			.where(sql`${t.module_id} IS NULL`),
		index('idx_lessons_module').on(t.module_id),
		index('idx_lessons_order').on(t.order_index),
		index('idx_lessons_slug').on(t.module_id, t.slug),
		index('idx_lessons_media_asset').on(t.media_asset_id)
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
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		unique('user_progress_user_id_lesson_id_unique').on(t.user_id, t.lesson_id),
		index('idx_user_progress_user').on(t.user_id),
		index('idx_user_progress_lesson').on(t.lesson_id)
	]
);
