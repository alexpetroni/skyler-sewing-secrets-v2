import { pgTable, uuid, text, integer, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core';

export const mediaStatus = pgEnum('media_status', ['uploading', 'processing', 'ready', 'failed']);

// One row per Bunny Stream video (`{ libraryId, videoId }`). Lessons point at it
// through `lessons.media_asset_id`; the legacy `lessons.video_url` is backfilled
// into this table by `backfill/media-assets.ts`.
export const media_assets = pgTable(
	'media_assets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		provider: text('provider').notNull().default('bunny'),
		library_id: text('library_id').notNull(),
		video_id: text('video_id').notNull(),
		title: text('title'),
		duration_seconds: integer('duration_seconds'),
		status: mediaStatus('status').notNull().default('uploading'),
		thumbnail_url: text('thumbnail_url'),
		width: integer('width'),
		height: integer('height'),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [unique('media_assets_library_id_video_id_unique').on(t.library_id, t.video_id)]
);
