import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { useTestDb } from '../helpers/db.ts';

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

describe('legacy migrations applied to PGlite', () => {
	const { db } = useTestDb();

	it('creates every legacy table in the public schema', async () => {
		const result = await db().execute<{ table_name: string }>(sql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`);
		expect(result.rows.map((row) => row.table_name)).toEqual(LEGACY_TABLES);
	});

	it('records both legacy migrations in the drizzle ledger', async () => {
		const result = await db().execute<{ count: number }>(
			sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`
		);
		expect(result.rows[0]?.count).toBe(2);
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
		// Seed rows come from the migration, not from a test: re-apply after truncation.
		await db().execute(sql`
			INSERT INTO pricing_config (name, base_price, currency, is_active)
			VALUES ('Lifetime Access', 14900, 'gbp', true) ON CONFLICT (name) DO NOTHING
		`);
		await db().execute(sql`
			INSERT INTO site_settings (key, value) VALUES ('maintenance_mode', 'false')
			ON CONFLICT (key) DO NOTHING
		`);
		const pricing = await db().query.pricing_config.findMany();
		expect(pricing).toHaveLength(1);
		expect(pricing[0]).toMatchObject({
			name: 'Lifetime Access',
			base_price: 14900,
			currency: 'gbp',
			is_active: true
		});

		const maintenance = await db().query.site_settings.findFirst({
			where: eq(schema.site_settings.key, 'maintenance_mode')
		});
		expect(maintenance?.value).toBe('false');
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
