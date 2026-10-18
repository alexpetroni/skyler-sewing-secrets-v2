import {
	pgTable,
	uuid,
	text,
	integer,
	boolean,
	timestamp,
	pgEnum,
	index,
	unique
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.ts';

export const lessonType = pgEnum('lesson_type', ['video', 'article']);

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
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
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
