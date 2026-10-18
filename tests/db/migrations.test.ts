import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { createTestDb, useTestDb } from '../helpers/db.ts';

const LEGACY_TABLES = [
	'users',
	'sessions',
	'accounts',
	'verifications',
	'profiles',
	'pricing_config',
	'promo_codes',
	'modules',
	'lessons',
	'lesson_resources',
	'user_progress',
	'blog_posts',
	'testimonials',
	'faq_items',
	'contact_submissions',
	'newsletter_subscribers',
	'payments',
	'site_settings'
].sort();

// Added by 0002_v2_catalogue.sql.
const V2_TABLES = [
	'media_assets',
	'products',
	'product_items',
	'orders',
	'order_items',
	'promo_code_products',
	'promo_redemptions',
	'entitlements',
	'webhook_events',
	'audit_log',
	'request_limits',
	'two_factors',
	'rate_limits'
].sort();

const V2_ENUMS = [
	'media_status',
	'lesson_kind',
	'product_kind',
	'access_scope',
	'order_status',
	'promo_scope',
	'entitlement_source'
].sort();

/**
 * Drizzle wraps driver errors as `Failed query: …` with the Postgres error
 * as `cause`; resolve to that message so tests can match constraint names.
 */
async function databaseError(operation: Promise<unknown>): Promise<string> {
	try {
		await operation;
	} catch (error) {
		if (error instanceof Error && error.cause instanceof Error) return error.cause.message;
		return String(error);
	}
	throw new Error('expected the database to reject the statement');
}

describe('migrations applied to PGlite', () => {
	const { db } = useTestDb();

	it('creates every legacy and v2 table in the public schema', async () => {
		const result = await db().execute<{ table_name: string }>(sql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`);
		expect(result.rows.map((row) => row.table_name)).toEqual(
			[...LEGACY_TABLES, ...V2_TABLES].sort()
		);
	});

	it('records the two legacy migrations, 0002, 0003 and 0004 in the drizzle ledger', async () => {
		const result = await db().execute<{ count: number }>(
			sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
		);
		expect(result.rows[0]?.count).toBe(5);
	});

	it('adds the nullable admin columns of 0004 to orders and webhook_events', async () => {
		const result = await db().execute<{
			table_name: string;
			column_name: string;
			is_nullable: 'YES' | 'NO';
			data_type: string;
		}>(sql`
			SELECT table_name, column_name, is_nullable, data_type FROM information_schema.columns
			WHERE table_schema = 'public' AND (
				(table_name = 'orders' AND column_name = 'admin_notes')
				OR (table_name = 'webhook_events' AND column_name = 'reference')
			)
			ORDER BY table_name, column_name
		`);
		expect(result.rows).toEqual([
			{ table_name: 'orders', column_name: 'admin_notes', is_nullable: 'YES', data_type: 'text' },
			{
				table_name: 'webhook_events',
				column_name: 'reference',
				is_nullable: 'YES',
				data_type: 'text'
			}
		]);
	});

	it('adds the nullable Markdown columns of 0003 to blog_posts and faq_items', async () => {
		const result = await db().execute<{
			table_name: string;
			column_name: string;
			is_nullable: 'YES' | 'NO';
			data_type: string;
		}>(sql`
			SELECT table_name, column_name, is_nullable, data_type FROM information_schema.columns
			WHERE table_schema = 'public' AND (
				(table_name = 'blog_posts' AND column_name IN ('content_md', 'content_html'))
				OR (table_name = 'faq_items' AND column_name IN ('answer_md', 'answer_html'))
			)
			ORDER BY table_name, column_name
		`);
		expect(result.rows).toEqual([
			{
				table_name: 'blog_posts',
				column_name: 'content_html',
				is_nullable: 'YES',
				data_type: 'text'
			},
			{
				table_name: 'blog_posts',
				column_name: 'content_md',
				is_nullable: 'YES',
				data_type: 'text'
			},
			{
				table_name: 'faq_items',
				column_name: 'answer_html',
				is_nullable: 'YES',
				data_type: 'text'
			},
			{ table_name: 'faq_items', column_name: 'answer_md', is_nullable: 'YES', data_type: 'text' }
		]);
	});

	it('creates every v2 enum type', async () => {
		const result = await db().execute<{ typname: string }>(sql`
			SELECT typname FROM pg_type
			WHERE typtype = 'e' AND typname IN (${sql.join(
				V2_ENUMS.map((name) => sql`${name}`),
				sql`, `
			)})
			ORDER BY typname
		`);
		expect(result.rows.map((row) => row.typname)).toEqual(V2_ENUMS);
	});

	it('adds the v2 columns to legacy tables and makes lessons.module_id nullable', async () => {
		const result = await db().execute<{
			table_name: string;
			column_name: string;
			is_nullable: 'YES' | 'NO';
		}>(sql`
			SELECT table_name, column_name, is_nullable FROM information_schema.columns
			WHERE table_schema = 'public' AND (
				(table_name = 'lessons' AND column_name IN ('module_id', 'media_asset_id', 'kind', 'content_md', 'content_html'))
				OR (table_name = 'modules' AND column_name = 'is_course_content')
				OR (table_name = 'users' AND column_name = 'two_factor_enabled')
				OR (table_name = 'newsletter_subscribers' AND column_name IN ('confirmed_at', 'confirm_token_hash'))
				OR (table_name = 'promo_codes' AND column_name IN ('applies_to', 'max_redemptions', 'max_redemptions_per_user', 'min_subtotal', 'starts_at', 'ends_at', 'stackable_with_sale'))
			)
			ORDER BY table_name, column_name
		`);
		const columns = result.rows.map((row) => `${row.table_name}.${row.column_name}`).sort();
		expect(columns).toEqual([
			'lessons.content_html',
			'lessons.content_md',
			'lessons.kind',
			'lessons.media_asset_id',
			'lessons.module_id',
			'modules.is_course_content',
			'newsletter_subscribers.confirm_token_hash',
			'newsletter_subscribers.confirmed_at',
			'promo_codes.applies_to',
			'promo_codes.ends_at',
			'promo_codes.max_redemptions',
			'promo_codes.max_redemptions_per_user',
			'promo_codes.min_subtotal',
			'promo_codes.stackable_with_sale',
			'promo_codes.starts_at',
			'users.two_factor_enabled'
		]);
		const moduleId = result.rows.find(
			(row) => row.table_name === 'lessons' && row.column_name === 'module_id'
		);
		expect(moduleId?.is_nullable).toBe('YES');
	});

	it('accepts a standalone lesson without a module and rejects a duplicate standalone slug', async () => {
		await db().insert(schema.lessons).values({ title: 'Solo', slug: 'solo', module_id: null });
		expect(
			await databaseError(
				db().insert(schema.lessons).values({ title: 'Solo again', slug: 'solo', module_id: null })
			)
		).toMatch(/idx_lessons_standalone_slug/);
		const rows = await db().select({ module_id: schema.lessons.module_id }).from(schema.lessons);
		expect(rows).toEqual([{ module_id: null }]);
	});

	it('allows one active entitlement per user and product, and a new one after revocation', async () => {
		const [user] = await db()
			.insert(schema.users)
			.values({ email: 'owner@example.com' })
			.returning({ id: schema.users.id });
		if (!user) throw new Error('user insert returned no row');
		await db().insert(schema.profiles).values({ id: user.id, email: 'owner@example.com' });
		const [product] = await db()
			.insert(schema.products)
			.values({
				slug: 'course',
				kind: 'course',
				access_scope: 'all',
				title: 'Course',
				price: 14900
			})
			.returning({ id: schema.products.id });
		if (!product) throw new Error('product insert returned no row');
		const grant = () =>
			db()
				.insert(schema.entitlements)
				.values({ user_id: user.id, product_id: product.id, source: 'admin_grant' })
				.returning({ id: schema.entitlements.id });

		const [first] = await grant();
		expect(await databaseError(grant())).toMatch(/idx_entitlements_active/);

		await db()
			.update(schema.entitlements)
			.set({ revoked_at: sql`now()`, revoke_reason: 'refund' })
			.where(eq(schema.entitlements.id, first!.id));
		const [second] = await grant();
		expect(second?.id).not.toBe(first!.id);

		const rows = await db()
			.select({ revoked: sql<boolean>`${schema.entitlements.revoked_at} IS NOT NULL` })
			.from(schema.entitlements)
			.orderBy(schema.entitlements.granted_at);
		expect(rows).toEqual([{ revoked: true }, { revoked: false }]);
	});

	it('refuses to delete a profile that has orders (orders.user_id RESTRICT)', async () => {
		const [user] = await db()
			.insert(schema.users)
			.values({ email: 'buyer@example.com' })
			.returning({ id: schema.users.id });
		if (!user) throw new Error('user insert returned no row');
		await db().insert(schema.profiles).values({ id: user.id, email: 'buyer@example.com' });
		await db().insert(schema.orders).values({ user_id: user.id, subtotal: 14900, total: 14900 });

		expect(
			await databaseError(db().delete(schema.profiles).where(eq(schema.profiles.id, user.id)))
		).toMatch(/orders_user_id_profiles_id_fk/);
	});

	it('defines the updated_at and promo usage functions', async () => {
		const result = await db().execute<{ proname: string }>(sql`
			SELECT proname FROM pg_proc
			WHERE proname IN ('update_updated_at', 'increment_promo_code_usage')
			ORDER BY proname
		`);
		expect(result.rows.map((row) => row.proname)).toEqual([
			'increment_promo_code_usage',
			'update_updated_at'
		]);
	});

	it('seeds the default pricing row and maintenance_mode setting', async () => {
		// `useTestDb()` truncates every table before each test, which removes the
		// rows 0001_triggers_functions_seed.sql inserted. Assert against a database
		// that has only had the migrations applied, so the migration is what is tested.
		const fresh = await createTestDb();
		try {
			const pricing = await fresh.db.query.pricing_config.findMany();
			expect(pricing).toHaveLength(1);
			expect(pricing[0]).toMatchObject({
				name: 'Lifetime Access',
				base_price: 14900,
				currency: 'gbp',
				is_active: true
			});

			const settings = await fresh.db.query.site_settings.findMany();
			expect(settings).toHaveLength(1);
			expect(settings[0]).toMatchObject({ key: 'maintenance_mode', value: 'false' });
		} finally {
			await fresh.close();
		}
	});

	it('bumps profiles.updated_at through the trigger on update', async () => {
		const [user] = await db()
			.insert(schema.users)
			.values({ email: 'trigger@example.com' })
			.returning({ id: schema.users.id });
		if (!user) throw new Error('user insert returned no row');

		const stale = '2020-01-01T00:00:00.000Z';
		await db().insert(schema.profiles).values({
			id: user.id,
			email: 'trigger@example.com',
			updated_at: stale
		});
		const [before] = await db()
			.select({ updated_at: schema.profiles.updated_at })
			.from(schema.profiles)
			.where(eq(schema.profiles.id, user.id));
		expect(new Date(before!.updated_at).getTime()).toBe(Date.parse(stale));

		await db()
			.update(schema.profiles)
			.set({ full_name: 'Trigger Test' })
			.where(eq(schema.profiles.id, user.id));

		const [after] = await db()
			.select({ updated_at: schema.profiles.updated_at, full_name: schema.profiles.full_name })
			.from(schema.profiles)
			.where(eq(schema.profiles.id, user.id));
		expect(after!.full_name).toBe('Trigger Test');
		expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(Date.parse(stale));
	});
});
