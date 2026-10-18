import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';

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
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('idx_profiles_email').on(t.email),
		index('idx_profiles_is_member').on(t.is_member),
		index('idx_profiles_is_admin').on(t.is_admin)
	]
);
