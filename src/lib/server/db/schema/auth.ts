import {
	pgTable,
	uuid,
	text,
	boolean,
	bigint,
	integer,
	timestamp,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';

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
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	// twoFactor plugin field `user.twoFactorEnabled` (boolean, defaultValue false):
	// node_modules/better-auth/dist/plugins/two-factor/schema.mjs
	twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false)
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

// Better Auth `twoFactor` plugin table. Field list verified against the
// installed package: node_modules/better-auth/dist/plugins/two-factor/schema.mjs
// (model `twoFactor`: secret, backupCodes, userId → user.id, verified default
// true, failedVerificationCount default 0, lockedUntil; secret and userId
// indexed; no timestamps). The drizzle adapter runs with `usePlural: true`, so
// it looks the model up as `twoFactors` in this schema object
// (node_modules/@better-auth/core/dist/db/adapter/get-model-name.mjs appends
// an `s`); the database table follows the legacy snake_case plural pattern.
export const twoFactors = pgTable(
	'two_factors',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		secret: text('secret').notNull(),
		backupCodes: text('backup_codes').notNull(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		verified: boolean('verified').notNull().default(true),
		failedVerificationCount: integer('failed_verification_count').notNull().default(0),
		lockedUntil: timestamp('locked_until', { withTimezone: true })
	},
	(t) => [index('idx_two_factors_secret').on(t.secret), index('idx_two_factors_user').on(t.userId)]
);

// Better Auth `rateLimit: { storage: 'database' }` table. Field list verified
// against node_modules/@better-auth/core/src/db/get-tables.ts (`rateLimitTable`:
// key unique string, count number, lastRequest number with `bigint: true`,
// model name `rateLimit`); the limiter reads and writes it through the adapter
// in node_modules/better-auth/dist/api/rate-limiter/index.mjs, which converts a
// bigint `lastRequest` back to a number. Looked up as `rateLimits` (usePlural).
export const rateLimits = pgTable('rate_limits', {
	id: uuid('id').primaryKey().defaultRandom(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull(),
	lastRequest: bigint('last_request', { mode: 'number' }).notNull()
});
