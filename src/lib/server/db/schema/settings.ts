import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const site_settings = pgTable('site_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull().default(''),
	updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow()
});
