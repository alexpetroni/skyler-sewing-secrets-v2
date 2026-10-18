import { pgTable, uuid, text, integer, timestamp, jsonb, unique, index } from 'drizzle-orm/pg-core';
import { profiles } from './profiles.ts';

// Idempotency store for Stripe and Bunny deliveries: a webhook is processed
// at most once per (provider, event_id). `reference` (0004_admin) is the
// provider object the event is about (checkout session or payment intent id),
// so an order's admin page can list the deliveries that concern it.
export const webhook_events = pgTable(
	'webhook_events',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		provider: text('provider').notNull(),
		event_id: text('event_id').notNull(),
		type: text('type').notNull(),
		reference: text('reference'),
		received_at: timestamp('received_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow(),
		processed_at: timestamp('processed_at', { withTimezone: true, mode: 'string' }),
		error: text('error')
	},
	(t) => [
		unique('webhook_events_provider_event_id_unique').on(t.provider, t.event_id),
		index('idx_webhook_events_reference').on(t.provider, t.reference)
	]
);

// Written by every admin mutation in the same transaction as the change.
export const audit_log = pgTable(
	'audit_log',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		actor_id: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
		action: text('action').notNull(),
		entity: text('entity').notNull(),
		entity_id: text('entity_id'),
		before: jsonb('before'),
		after: jsonb('after'),
		created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('idx_audit_log_entity').on(t.entity, t.entity_id),
		index('idx_audit_log_created').on(t.created_at)
	]
);

// Fixed-window counters for the app's own request limiter (contact form,
// promo lookups, ...). Better Auth keeps its own `rate_limits` table.
export const request_limits = pgTable('request_limits', {
	key: text('key').primaryKey(),
	count: integer('count').notNull().default(0),
	window_start: timestamp('window_start', { withTimezone: true, mode: 'string' }).notNull()
});
