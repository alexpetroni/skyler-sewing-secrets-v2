import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	checkSeedTarget,
	SEED_ADMIN_EMAIL,
	SEED_MEMBER_EMAIL,
	SEED_PASSWORD,
	SEED_PROMO_CODE,
	seedDev
} from '../scripts/seed-dev.ts';
import { schema, type Db } from '../src/lib/server/db/index.ts';
import { createFakeLogger } from '../src/lib/server/platform/fakes/logger.ts';
import { useTestDb } from './helpers/db.ts';

const {
	accounts,
	entitlements,
	lessons,
	media_assets,
	modules,
	product_items,
	products,
	profiles,
	promo_codes,
	users
} = schema;

/** Every row the seed owns, in a stable order, for before/after comparison. */
async function snapshot(db: Db) {
	return {
		users: await db.select().from(users).orderBy(asc(users.email)),
		accounts: await db.select().from(accounts).orderBy(asc(accounts.userId)),
		profiles: await db.select().from(profiles).orderBy(asc(profiles.email)),
		modules: await db.select().from(modules),
		lessons: await db.select().from(lessons).orderBy(asc(lessons.slug)),
		media: await db.select().from(media_assets).orderBy(asc(media_assets.video_id)),
		products: await db.select().from(products).orderBy(asc(products.slug)),
		items: await db
			.select({ product: products.slug, lesson: lessons.slug })
			.from(product_items)
			.innerJoin(products, eq(products.id, product_items.product_id))
			.innerJoin(lessons, eq(lessons.id, product_items.lesson_id))
			.orderBy(asc(products.slug), asc(lessons.slug)),
		entitlements: await db.select().from(entitlements),
		promos: await db.select().from(promo_codes)
	};
}

describe('scripts/seed-dev.ts', () => {
	const { db } = useTestDb();

	it('seeds the listed rows on the first run and nothing more on the second', async () => {
		const first = await seedDev(db(), createFakeLogger());
		expect(first).toHaveLength(13);
		const afterFirst = await snapshot(db());

		const second = await seedDev(db(), createFakeLogger());
		expect(second).toEqual([]);
		expect(await snapshot(db())).toEqual(afterFirst);

		const rows = afterFirst;
		expect(rows.users.map((user) => [user.email, user.emailVerified])).toEqual([
			[SEED_ADMIN_EMAIL, true],
			[SEED_MEMBER_EMAIL, true]
		]);
		for (const account of rows.accounts) {
			expect(account.providerId).toBe('credential');
			expect(await bcrypt.compare(SEED_PASSWORD, account.password ?? '')).toBe(true);
		}
		const flags = rows.profiles.map((p) => [p.email, p.is_admin, p.is_member, p.is_suspended]);
		expect(flags).toEqual([
			[SEED_ADMIN_EMAIL, true, false, false],
			[SEED_MEMBER_EMAIL, false, true, false]
		]);
		expect(rows.users.map((user) => user.twoFactorEnabled)).toEqual([false, false]);

		expect(rows.modules.map((module) => module.slug)).toEqual(['getting-started']);
		const moduleId = rows.modules[0].id;
		expect(rows.lessons.map((lesson) => [lesson.slug, lesson.module_id])).toEqual([
			['invisible-zips', null],
			['perfect-french-seams', null],
			['threading-your-machine', moduleId],
			['your-first-seam', moduleId]
		]);
		for (const lesson of rows.lessons) {
			const asset = rows.media.find((media) => media.id === lesson.media_asset_id);
			expect(asset?.status).toBe('ready');
			expect(lesson.video_url).toBe(`bunny:${asset?.library_id}/${asset?.video_id}`);
			expect(lesson.is_published).toBe(true);
		}

		expect(
			rows.products.map((p) => [p.slug, p.kind, p.access_scope, p.price, p.is_published])
		).toEqual([
			['finishing-touches', 'bundle', 'items', 2900, true],
			['invisible-zips', 'single', 'items', 1200, true],
			['perfect-french-seams', 'single', 'items', 900, true],
			['the-complete-course', 'course', 'all', 14900, true]
		]);
		expect(rows.items).toEqual([
			{ product: 'finishing-touches', lesson: 'invisible-zips' },
			{ product: 'finishing-touches', lesson: 'your-first-seam' },
			{ product: 'invisible-zips', lesson: 'invisible-zips' },
			{ product: 'perfect-french-seams', lesson: 'perfect-french-seams' }
		]);

		const member = rows.profiles.find((p) => p.email === SEED_MEMBER_EMAIL);
		const flagship = rows.products.find((p) => p.kind === 'course');
		expect(rows.entitlements.map((e) => [e.user_id, e.product_id, e.source, e.revoked_at])).toEqual(
			[[member?.id, flagship?.id, 'migration', null]]
		);

		expect(
			rows.promos.map((p) => [p.code, p.discount_type, p.discount_value, p.is_active])
		).toEqual([[SEED_PROMO_CODE, 'percentage', 10, true]]);
	});

	it('refuses a database that already holds an account that is not a seed account', async () => {
		await db()
			.insert(users)
			.values({ id: crypto.randomUUID(), email: 'owner@example.com', emailVerified: true });

		await expect(seedDev(db(), createFakeLogger())).rejects.toThrow(
			/Refusing to seed: the database already holds 1 account/
		);
		expect(await db().select().from(products)).toEqual([]);
		expect((await db().select().from(users)).map((u) => u.email)).toEqual(['owner@example.com']);
	});

	it('checkSeedTarget lets PGlite through and needs the Neon host repeated in SEED_DEV_CONFIRM', () => {
		const neon = 'postgresql://user:pw@ep-calm-sea-123456.eu-central-1.aws.neon.tech/neondb';

		expect(
			checkSeedTarget({ url: 'pglite://./.pglite', driver: 'pglite', confirm: undefined })
		).toBeNull();
		expect(checkSeedTarget({ url: neon, driver: 'neon', confirm: undefined })).toMatch(
			/Refusing to seed a remote database.*SEED_DEV_CONFIRM=ep-calm-sea-123456\.eu-central-1\.aws\.neon\.tech/
		);
		expect(checkSeedTarget({ url: neon, driver: 'neon', confirm: 'ep-other.neon.tech' })).toMatch(
			/does not match/
		);
		expect(
			checkSeedTarget({
				url: neon,
				driver: 'neon',
				confirm: 'ep-calm-sea-123456.eu-central-1.aws.neon.tech'
			})
		).toBeNull();
		expect(checkSeedTarget({ url: 'not a url', driver: 'neon', confirm: 'x' })).toMatch(
			/valid URL/
		);
	});
});
