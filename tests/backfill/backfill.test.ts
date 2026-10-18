import { asc, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema, type Db } from '../../src/lib/server/db/index.ts';
import {
	FLAGSHIP_SLUG,
	FLAGSHIP_TITLE,
	runAll,
	type BackfillResult
} from '../../src/lib/server/db/backfill/index.ts';
import { useTestDb } from '../helpers/db.ts';

const {
	users,
	profiles,
	pricing_config,
	promo_codes,
	payments,
	modules,
	lessons,
	media_assets,
	products,
	orders,
	order_items,
	promo_redemptions,
	entitlements
} = schema;

const MEMBER_SINCE = '2023-03-01T10:00:00.000Z';

interface Seed {
	memberA: string;
	memberB: string;
	visitorC: string;
	promoId: string;
	paymentPaid: string;
	paymentPromoPending: string;
	paymentRefunded: string;
	lessonIds: Record<'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'article' | 'external', string>;
}

/**
 * Legacy-shaped data: two members (one with `member_since`, one without), one
 * non-member, three payments (paid, pending with a promo and no session id,
 * refunded), seven lessons across two modules (five Bunny videos with one
 * duplicate url, one article, one non-Bunny video), one active pricing row.
 */
async function seedLegacy(db: Db): Promise<Seed> {
	const makeUser = async (email: string, member: boolean, member_since: string | null) => {
		const [user] = await db.insert(users).values({ email }).returning({ id: users.id });
		if (!user) throw new Error('user insert returned no row');
		await db.insert(profiles).values({
			id: user.id,
			email,
			is_member: member,
			member_since,
			created_at: '2022-06-15T09:00:00.000Z'
		});
		return user.id;
	};
	const memberA = await makeUser('a@example.com', true, MEMBER_SINCE);
	const memberB = await makeUser('b@example.com', true, null);
	const visitorC = await makeUser('c@example.com', false, null);

	await db.insert(pricing_config).values({
		name: 'Lifetime Access',
		base_price: 14900,
		currency: 'gbp',
		is_active: true
	});

	const [promo] = await db
		.insert(promo_codes)
		.values({
			code: 'SPRING20',
			discount_type: 'fixed',
			discount_value: 2000,
			max_uses: 10,
			current_uses: 1,
			min_purchase_amount: 5000,
			valid_from: '2024-01-01T00:00:00.000Z',
			valid_until: '2030-01-01T00:00:00.000Z'
		})
		.returning({ id: promo_codes.id });
	if (!promo) throw new Error('promo insert returned no row');

	const inserted = await db
		.insert(payments)
		.values([
			{
				user_id: memberA,
				stripe_payment_intent_id: 'pi_A',
				stripe_checkout_session_id: 'cs_A',
				amount: 14900,
				status: 'succeeded',
				created_at: '2024-02-01T12:00:00.000Z'
			},
			{
				user_id: visitorC,
				stripe_payment_intent_id: null,
				stripe_checkout_session_id: null,
				amount: 12900,
				status: 'pending',
				promo_code_id: promo.id,
				discount_amount: 2000,
				created_at: '2024-03-01T12:00:00.000Z'
			},
			{
				user_id: visitorC,
				stripe_payment_intent_id: 'pi_C',
				stripe_checkout_session_id: 'cs_C',
				amount: 14900,
				status: 'refunded',
				created_at: '2024-04-01T12:00:00.000Z'
			}
		])
		.returning({ id: payments.id, session: payments.stripe_checkout_session_id });
	const byKey = (key: string | null) => {
		const row = inserted.find((p) => p.session === key);
		if (!row) throw new Error(`payment ${key} not inserted`);
		return row.id;
	};

	const [m1, m2] = await db
		.insert(modules)
		.values([
			{ title: 'Basics', slug: 'basics' },
			{ title: 'Fitting', slug: 'fitting' }
		])
		.returning({ id: modules.id });
	if (!m1 || !m2) throw new Error('module insert returned no rows');

	const lessonRows = await db
		.insert(lessons)
		.values([
			{
				module_id: m1.id,
				title: 'L1',
				slug: 'l1',
				video_url: 'bunny:123/vid-a',
				duration_minutes: 10,
				order_index: 1
			},
			{ module_id: m1.id, title: 'L2', slug: 'l2', video_url: 'bunny:123/vid-b', order_index: 2 },
			{
				module_id: m1.id,
				title: 'L3',
				slug: 'l3',
				video_url: 'bunny:123/vid-a',
				duration_minutes: 12,
				order_index: 3
			},
			{
				module_id: m2.id,
				title: 'L4',
				slug: 'l4',
				video_url: 'bunny:123/vid-c',
				duration_minutes: 7,
				order_index: 1
			},
			{
				module_id: m2.id,
				title: 'L5',
				slug: 'l5',
				video_url: 'bunny:123/vid-d',
				duration_minutes: 3,
				order_index: 2
			},
			{
				module_id: m2.id,
				title: 'Reading',
				slug: 'reading',
				lesson_type: 'article',
				// Legacy admin HTML is sanitised on the way into content_html.
				content: '<p onclick="steal()">Pressing matters.</p><script>steal()</script>',
				order_index: 3
			},
			{
				module_id: m2.id,
				title: 'External',
				slug: 'external',
				video_url: 'https://www.youtube.com/watch?v=abc',
				order_index: 4
			}
		])
		.returning({ id: lessons.id, slug: lessons.slug });
	const lessonId = (slug: string) => {
		const row = lessonRows.find((l) => l.slug === slug);
		if (!row) throw new Error(`lesson ${slug} not inserted`);
		return row.id;
	};

	return {
		memberA,
		memberB,
		visitorC,
		promoId: promo.id,
		paymentPaid: byKey('cs_A'),
		paymentPromoPending: byKey(null),
		paymentRefunded: byKey('cs_C'),
		lessonIds: {
			l1: lessonId('l1'),
			l2: lessonId('l2'),
			l3: lessonId('l3'),
			l4: lessonId('l4'),
			l5: lessonId('l5'),
			article: lessonId('reading'),
			external: lessonId('external')
		}
	};
}

async function tableCounts(db: Db): Promise<Record<string, number>> {
	const tables = {
		media_assets,
		products,
		orders,
		order_items,
		promo_redemptions,
		entitlements,
		lessons,
		promo_codes,
		profiles
	};
	const counts: Record<string, number> = {};
	for (const [name, table] of Object.entries(tables)) {
		const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
		counts[name] = row?.n ?? -1;
	}
	return counts;
}

const FIRST_RUN_COUNTS: Required<Omit<BackfillResult, 'flagship-product'>> = {
	'promo-codes': { promo_codes_updated: 1 },
	'media-assets': { media_assets_inserted: 4, lessons_linked: 5, articles_converted: 1 },
	orders: { orders_inserted: 3, order_items_inserted: 3, promo_redemptions_inserted: 1 },
	entitlements: { entitlements_from_purchase: 1, entitlements_from_migration: 1 }
};

describe('backfill runAll on legacy-shaped data', () => {
	const { db } = useTestDb();

	it('creates the flagship product, orders, entitlements, media assets and promo rows', async () => {
		const seed = await seedLegacy(db());
		const result = await runAll(db());

		expect(result).toMatchObject(FIRST_RUN_COUNTS);
		expect(result['flagship-product'].products_inserted).toBe(1);

		// Flagship product from pricing_config.
		const productRows = await db().select().from(products);
		expect(productRows).toHaveLength(1);
		const product = productRows[0]!;
		expect(product).toMatchObject({
			id: result['flagship-product'].product_id,
			slug: FLAGSHIP_SLUG,
			title: FLAGSHIP_TITLE,
			kind: 'course',
			access_scope: 'all',
			price: 14900,
			currency: 'gbp',
			is_published: true,
			is_featured: true
		});

		// Orders: one per payment, keyed on the payment id, status mapped.
		const orderRows = await db().select().from(orders).orderBy(asc(orders.created_at));
		expect(orderRows.map((o) => o.id)).toEqual([
			seed.paymentPaid,
			seed.paymentPromoPending,
			seed.paymentRefunded
		]);
		const [paid, pending, refunded] = orderRows as [
			(typeof orderRows)[number],
			(typeof orderRows)[number],
			(typeof orderRows)[number]
		];
		expect(paid).toMatchObject({
			user_id: seed.memberA,
			status: 'paid',
			currency: 'gbp',
			subtotal: 14900,
			discount_total: 0,
			total: 14900,
			stripe_checkout_session_id: 'cs_A',
			stripe_payment_intent_id: 'pi_A',
			promo_code_id: null,
			expires_at: null
		});
		expect(paid.paid_at).toBe(paid.created_at);
		expect(Date.parse(paid.created_at)).toBe(Date.parse('2024-02-01T12:00:00.000Z'));
		expect(pending).toMatchObject({
			user_id: seed.visitorC,
			status: 'pending',
			subtotal: 14900,
			discount_total: 2000,
			total: 12900,
			stripe_checkout_session_id: null,
			promo_code_id: seed.promoId,
			paid_at: null
		});
		expect(refunded).toMatchObject({
			user_id: seed.visitorC,
			status: 'refunded',
			total: 14900,
			stripe_checkout_session_id: 'cs_C'
		});
		expect(refunded.paid_at).toBe(refunded.created_at);

		// Items: the flagship product with the order's amounts.
		const itemRows = await db().select().from(order_items);
		expect(itemRows).toHaveLength(3);
		const itemFor = (orderId: string) => itemRows.find((i) => i.order_id === orderId);
		expect(itemFor(paid.id)).toMatchObject({
			product_id: product.id,
			product_title: FLAGSHIP_TITLE,
			list_price: 14900,
			unit_price: 14900,
			discount_amount: 0,
			refunded_amount: 0
		});
		expect(itemFor(pending.id)).toMatchObject({
			list_price: 14900,
			unit_price: 12900,
			discount_amount: 2000,
			refunded_amount: 0
		});
		expect(itemFor(refunded.id)).toMatchObject({
			unit_price: 14900,
			refunded_amount: 14900
		});

		// One redemption, for the payment that used the code.
		const redemptionRows = await db().select().from(promo_redemptions);
		expect(redemptionRows).toHaveLength(1);
		expect(redemptionRows[0]).toMatchObject({
			promo_code_id: seed.promoId,
			order_id: pending.id,
			user_id: seed.visitorC,
			discount_total: 2000
		});

		// Entitlements: purchase for the member with a paid order, migration otherwise.
		const entitlementRows = await db().select().from(entitlements);
		expect(entitlementRows).toHaveLength(2);
		const forUser = (userId: string) => entitlementRows.find((e) => e.user_id === userId);
		const a = forUser(seed.memberA);
		expect(a).toMatchObject({
			product_id: product.id,
			source: 'purchase',
			order_item_id: itemFor(paid.id)!.id,
			revoked_at: null
		});
		expect(Date.parse(a!.granted_at)).toBe(Date.parse(MEMBER_SINCE));
		const b = forUser(seed.memberB);
		expect(b).toMatchObject({ product_id: product.id, source: 'migration', order_item_id: null });
		expect(Date.parse(b!.granted_at)).toBe(Date.parse('2022-06-15T09:00:00.000Z'));
		expect(forUser(seed.visitorC)).toBeUndefined();

		// Media assets: one per distinct Bunny video (the first lesson in course
		// order supplies the duration: L1's 10 min, not L3's 12), lessons linked,
		// article converted.
		const assetRows = await db().select().from(media_assets).orderBy(asc(media_assets.video_id));
		expect(assetRows.map((m) => [m.library_id, m.video_id, m.status, m.duration_seconds])).toEqual([
			['123', 'vid-a', 'ready', 600],
			['123', 'vid-b', 'ready', null],
			['123', 'vid-c', 'ready', 420],
			['123', 'vid-d', 'ready', 180]
		]);
		expect(assetRows.every((m) => m.provider === 'bunny')).toBe(true);
		const lessonRows = await db().select().from(lessons);
		const lesson = (id: string) => lessonRows.find((l) => l.id === id)!;
		const assetId = (videoId: string) => assetRows.find((m) => m.video_id === videoId)!.id;
		expect(lesson(seed.lessonIds.l1).media_asset_id).toBe(assetId('vid-a'));
		expect(lesson(seed.lessonIds.l3).media_asset_id).toBe(assetId('vid-a'));
		expect(lesson(seed.lessonIds.l2).media_asset_id).toBe(assetId('vid-b'));
		expect(lesson(seed.lessonIds.l4).media_asset_id).toBe(assetId('vid-c'));
		expect(lesson(seed.lessonIds.l5).media_asset_id).toBe(assetId('vid-d'));
		expect(lesson(seed.lessonIds.external).media_asset_id).toBeNull();
		expect(lesson(seed.lessonIds.article)).toMatchObject({
			media_asset_id: null,
			kind: 'article',
			content_md: null,
			content_html: '<p>Pressing matters.</p>',
			content: '<p onclick="steal()">Pressing matters.</p><script>steal()</script>'
		});
		expect(lessonRows.filter((l) => l.kind === 'video')).toHaveLength(6);
		// Legacy video_url is kept for the old app.
		expect(lesson(seed.lessonIds.l1).video_url).toBe('bunny:123/vid-a');

		// Promo code validity columns copied.
		const [promo] = await db().select().from(promo_codes).where(eq(promo_codes.id, seed.promoId));
		expect(promo).toMatchObject({
			max_redemptions: 10,
			min_subtotal: 5000,
			applies_to: 'all',
			max_redemptions_per_user: null
		});
		expect(promo!.starts_at).toBe(promo!.valid_from);
		expect(promo!.ends_at).toBe(promo!.valid_until);
		expect(Date.parse(promo!.ends_at!)).toBe(Date.parse('2030-01-01T00:00:00.000Z'));

		// is_member is not synchronised here (PHASE-08).
		const profileRows = await db().select().from(profiles);
		const member = (id: string) => profileRows.find((p) => p.id === id)!.is_member;
		expect(member(seed.memberA)).toBe(true);
		expect(member(seed.memberB)).toBe(true);
		expect(member(seed.visitorC)).toBe(false);
	});

	it('is idempotent: a second run inserts nothing and returns the same product id', async () => {
		await seedLegacy(db());
		const first = await runAll(db());
		const before = await tableCounts(db());
		expect(before).toMatchObject({
			media_assets: 4,
			products: 1,
			orders: 3,
			order_items: 3,
			promo_redemptions: 1,
			entitlements: 2,
			lessons: 7,
			promo_codes: 1,
			profiles: 3
		});

		const second = await runAll(db());

		expect(second).toEqual({
			'promo-codes': { promo_codes_updated: 0 },
			'media-assets': { media_assets_inserted: 0, lessons_linked: 0, articles_converted: 0 },
			'flagship-product': {
				product_id: first['flagship-product'].product_id,
				products_inserted: 0
			},
			orders: { orders_inserted: 0, order_items_inserted: 0, promo_redemptions_inserted: 0 },
			entitlements: { entitlements_from_purchase: 0, entitlements_from_migration: 0 }
		});
		expect(await tableCounts(db())).toEqual(before);
	});

	it('rolls everything back when a later step fails inside the transaction', async () => {
		// No pricing_config row: the flagship step throws after promo codes and
		// media assets already ran, and the transaction must undo those too.
		const seed = await seedLegacy(db());
		await db().delete(pricing_config);

		await expect(runAll(db())).rejects.toThrow(/pricing_config/);

		expect(await tableCounts(db())).toMatchObject({
			media_assets: 0,
			products: 0,
			orders: 0,
			entitlements: 0
		});
		const [promo] = await db().select().from(promo_codes).where(eq(promo_codes.id, seed.promoId));
		expect(promo!.starts_at).toBeNull();
	});
});
