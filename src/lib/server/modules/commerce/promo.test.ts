import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createTestServices } from '../../../../../tests/helpers/services.ts';
import { schema, withTx } from '#lib/server/db/index.ts';
import { createFakeLogger } from '#lib/server/platform/fakes/logger.ts';
import type { PromoInput } from '#lib/shared/schemas/commerce.ts';
import { DomainError } from '../errors.ts';
import { createPromoService, normalizeCode, PromoRejectedError, type PromoLine } from './promo.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, orders, promo_codes, promo_redemptions } = schema;

const NOW = new Date('2026-10-18T12:00:00Z');
const YESTERDAY = '2026-10-17T12:00:00.000Z';
const TOMORROW = '2026-10-19T12:00:00.000Z';

let sequence = 0;
function promoInput(overrides: Partial<PromoInput> = {}): PromoInput {
	sequence += 1;
	return {
		code: `CODE${sequence}`,
		description: '',
		discountType: 'percentage',
		discountValue: 10,
		appliesTo: 'all',
		productIds: [],
		minSubtotal: null,
		maxRedemptions: null,
		maxRedemptionsPerUser: null,
		startsAt: null,
		endsAt: null,
		isActive: true,
		stackableWithSale: false,
		...overrides
	};
}

describe('createPromoService', () => {
	const { db } = useTestDb();
	const log = createFakeLogger();
	const promo = () => createPromoService({ db: db(), log });

	async function product(slug: string, price = 2900): Promise<string> {
		const row = await createTestServices(db()).catalog.create({
			kind: 'bundle',
			slug,
			title: slug,
			tagline: '',
			descriptionMd: '',
			coverImageUrl: '',
			price,
			salePrice: null,
			saleStartsAt: null,
			saleEndsAt: null,
			isFeatured: false,
			sortOrder: 0
		});
		return row.id;
	}

	async function user(email: string): Promise<string> {
		return createTestServices(db()).users.createCredentialUser({
			email,
			password: 'a-good-password',
			fullName: 'Buyer'
		});
	}

	async function order(
		userId: string,
		status: (typeof orders.$inferSelect)['status'] = 'paid'
	): Promise<string> {
		const [row] = await db()
			.insert(orders)
			.values({ user_id: userId, status, subtotal: 2900, total: 2610 })
			.returning();
		return row.id;
	}

	/** A redemption recorded the way checkout will: inside a transaction. */
	function reserve(promoCodeId: string, orderId: string, userId: string) {
		return withTx(db(), (tx) =>
			promo().reserveRedemption(tx, { promoCodeId, orderId, userId, discountTotal: 290, now: NOW })
		);
	}

	const lines = (...items: [string, number, boolean?][]): PromoLine[] =>
		items.map(([productId, effectivePrice, onSale = false]) => ({
			productId,
			effectivePrice,
			onSale
		}));

	describe('normalizeCode', () => {
		it('trims, upper-cases and checks the pattern', () => {
			expect(normalizeCode('  spring20 ')).toBe('SPRING20');
			expect(normalizeCode('gift-ab_1')).toBe('GIFT-AB_1');
			expect(normalizeCode('x')).toBeNull();
			expect(normalizeCode('has space')).toBeNull();
			expect(normalizeCode('a'.repeat(33))).toBeNull();
			expect(normalizeCode('')).toBeNull();
			expect(promo().normalizeCode('ok')).toBe('OK');
		});
	});

	describe('findValidByCode', () => {
		it('returns the rule for a valid code, matching case-insensitively', async () => {
			const bundle = await product('bundle');
			const created = await promo().create(
				promoInput({
					code: 'SPRING20',
					discountValue: 20,
					appliesTo: 'products',
					productIds: [bundle]
				})
			);
			const result = await promo().findValidByCode(' spring20 ', {
				lines: lines([bundle, 2900]),
				now: NOW
			});
			expect(result).toEqual({
				ok: true,
				rule: {
					id: created.id,
					code: 'SPRING20',
					discountType: 'percentage',
					discountValue: 20,
					appliesTo: 'products',
					productIds: [bundle],
					minSubtotal: null,
					stackableWithSale: false
				}
			});
		});

		it('not_found for an unknown or malformed code', async () => {
			const bundle = await product('bundle');
			const params = { lines: lines([bundle, 2900]), now: NOW };
			expect(await promo().findValidByCode('NOPE', params)).toEqual({
				ok: false,
				reason: 'not_found'
			});
			expect(await promo().findValidByCode('no spaces allowed', params)).toEqual({
				ok: false,
				reason: 'not_found'
			});
		});

		it('inactive when the admin switched the code off', async () => {
			const bundle = await product('bundle');
			const created = await promo().create(promoInput({ code: 'OFF' }));
			await promo().setActive(created.id, false);
			expect(
				await promo().findValidByCode('OFF', { lines: lines([bundle, 2900]), now: NOW })
			).toEqual({ ok: false, reason: 'inactive' });
		});

		it('not_started before starts_at and expired from ends_at', async () => {
			const bundle = await product('bundle');
			await promo().create(promoInput({ code: 'LATER', startsAt: TOMORROW }));
			await promo().create(promoInput({ code: 'GONE', endsAt: YESTERDAY }));
			await promo().create(promoInput({ code: 'ENDING', endsAt: NOW.toISOString() }));
			const params = { lines: lines([bundle, 2900]), now: NOW };
			expect(await promo().findValidByCode('LATER', params)).toEqual({
				ok: false,
				reason: 'not_started'
			});
			expect(await promo().findValidByCode('GONE', params)).toEqual({
				ok: false,
				reason: 'expired'
			});
			expect(await promo().findValidByCode('ENDING', params)).toEqual({
				ok: false,
				reason: 'expired'
			});
			// The window is open at starts_at itself and just before ends_at.
			await promo().create(
				promoInput({ code: 'OPEN', startsAt: NOW.toISOString(), endsAt: TOMORROW })
			);
			expect((await promo().findValidByCode('OPEN', params)).ok).toBe(true);
		});

		it('cap_reached once redemptions on live orders reach max_redemptions', async () => {
			const bundle = await product('bundle');
			const buyer = await user('one@example.com');
			const created = await promo().create(promoInput({ code: 'ONCE', maxRedemptions: 1 }));
			const params = { lines: lines([bundle, 2900]), now: NOW };
			expect((await promo().findValidByCode('ONCE', params)).ok).toBe(true);

			await reserve(created.id, await order(buyer, 'pending'), buyer);
			expect(await promo().findValidByCode('ONCE', params)).toEqual({
				ok: false,
				reason: 'cap_reached'
			});
		});

		it('user_cap_reached for the buyer who used it, still valid for another buyer', async () => {
			const bundle = await product('bundle');
			const alice = await user('alice@example.com');
			const bob = await user('bob@example.com');
			const created = await promo().create(
				promoInput({ code: 'PERUSER', maxRedemptionsPerUser: 1 })
			);
			await reserve(created.id, await order(alice), alice);

			const params = { lines: lines([bundle, 2900]), now: NOW };
			expect(await promo().findValidByCode('PERUSER', { ...params, userId: alice })).toEqual({
				ok: false,
				reason: 'user_cap_reached'
			});
			expect((await promo().findValidByCode('PERUSER', { ...params, userId: bob })).ok).toBe(true);
			// Anonymous visitors are checked against the per-user cap once they sign in.
			expect((await promo().findValidByCode('PERUSER', params)).ok).toBe(true);
		});

		it('not_eligible when the scope misses the cart or every scoped line is on sale', async () => {
			const bundle = await product('bundle');
			const single = await product('single', 900);
			await promo().create(
				promoInput({ code: 'SINGLEONLY', appliesTo: 'products', productIds: [single] })
			);
			expect(
				await promo().findValidByCode('SINGLEONLY', { lines: lines([bundle, 2900]), now: NOW })
			).toEqual({ ok: false, reason: 'not_eligible' });
			expect(
				await promo().findValidByCode('SINGLEONLY', {
					lines: lines([bundle, 2900], [single, 700, true]),
					now: NOW
				})
			).toEqual({ ok: false, reason: 'not_eligible' });
			expect(
				(
					await promo().findValidByCode('SINGLEONLY', {
						lines: lines([bundle, 2900], [single, 900]),
						now: NOW
					})
				).ok
			).toBe(true);
		});

		it('below_minimum when the eligible subtotal is under min_subtotal', async () => {
			const bundle = await product('bundle');
			const single = await product('single', 900);
			await promo().create(
				promoInput({
					code: 'BIGCART',
					appliesTo: 'products',
					productIds: [single],
					minSubtotal: 1000
				})
			);
			// The bundle is in the cart but not in scope, so it does not count towards the minimum.
			expect(
				await promo().findValidByCode('BIGCART', {
					lines: lines([bundle, 2900], [single, 900]),
					now: NOW
				})
			).toEqual({ ok: false, reason: 'below_minimum' });
		});

		it('ignores redemptions on expired orders', async () => {
			const bundle = await product('bundle');
			const buyer = await user('one@example.com');
			const created = await promo().create(
				promoInput({ code: 'ONCE', maxRedemptions: 1, maxRedemptionsPerUser: 1 })
			);
			await reserve(created.id, await order(buyer, 'expired'), buyer);
			const result = await promo().findValidByCode('ONCE', {
				userId: buyer,
				lines: lines([bundle, 2900]),
				now: NOW
			});
			expect(result.ok).toBe(true);
		});
	});

	describe('reserveRedemption / releaseRedemption', () => {
		it('sequential double reservation (PGlite is single-connection): the second throws cap_reached', async () => {
			const buyer = await user('one@example.com');
			const other = await user('two@example.com');
			const created = await promo().create(promoInput({ code: 'ONCE', maxRedemptions: 1 }));

			const first = await reserve(created.id, await order(buyer), buyer);
			expect(first.promo_code_id).toBe(created.id);
			expect(first.discount_total).toBe(290);
			expect(Date.parse(first.created_at)).toBe(NOW.getTime());

			const secondOrder = await order(other);
			await expect(reserve(created.id, secondOrder, other)).rejects.toMatchObject({
				name: 'PromoRejectedError',
				code: 'PROMO_REJECTED',
				reason: 'cap_reached'
			});
			// The failed transaction rolled back: still exactly one redemption.
			const rows = await db()
				.select()
				.from(promo_redemptions)
				.where(eq(promo_redemptions.promo_code_id, created.id));
			expect(rows).toHaveLength(1);
			expect(rows[0].order_id).not.toBe(secondOrder);
		});

		it('enforces the per-user cap and lets another buyer through', async () => {
			const alice = await user('alice@example.com');
			const bob = await user('bob@example.com');
			const created = await promo().create(
				promoInput({ code: 'PERUSER', maxRedemptionsPerUser: 1 })
			);
			await reserve(created.id, await order(alice), alice);
			const again = reserve(created.id, await order(alice), alice);
			await expect(again).rejects.toBeInstanceOf(PromoRejectedError);
			await expect(again).rejects.toMatchObject({ reason: 'user_cap_reached' });
			await expect(reserve(created.id, await order(bob), bob)).resolves.toMatchObject({
				user_id: bob
			});
		});

		it('releaseRedemption makes the code usable again', async () => {
			const bundle = await product('bundle');
			const buyer = await user('one@example.com');
			const created = await promo().create(promoInput({ code: 'ONCE', maxRedemptions: 1 }));
			const orderId = await order(buyer, 'pending');
			await reserve(created.id, orderId, buyer);
			const params = { lines: lines([bundle, 2900]), now: NOW };
			expect((await promo().findValidByCode('ONCE', params)).ok).toBe(false);

			expect(await withTx(db(), (tx) => promo().releaseRedemption(tx, orderId))).toBe(true);
			expect(await withTx(db(), (tx) => promo().releaseRedemption(tx, orderId))).toBe(false);
			expect((await promo().findValidByCode('ONCE', params)).ok).toBe(true);
			await expect(reserve(created.id, await order(buyer), buyer)).resolves.toBeDefined();
		});

		it('refuses an unknown code id', async () => {
			const buyer = await user('one@example.com');
			await expect(
				reserve('00000000-0000-4000-8000-000000000000', await order(buyer), buyer)
			).rejects.toMatchObject({ code: 'PROMO_NOT_FOUND' });
		});
	});

	describe('admin CRUD', () => {
		it('create stores the scope, mirrors the legacy columns and audits with an actor', async () => {
			const bundle = await product('bundle');
			const admin = await user('admin@example.com');
			const created = await promo().create(
				promoInput({
					code: 'ZIPPERS',
					description: 'Zipper week',
					discountType: 'fixed',
					discountValue: 500,
					appliesTo: 'products',
					productIds: [bundle, bundle],
					minSubtotal: 1000,
					maxRedemptions: 50,
					maxRedemptionsPerUser: 1,
					startsAt: YESTERDAY,
					endsAt: TOMORROW,
					stackableWithSale: true
				}),
				admin
			);
			expect(created).toMatchObject({
				code: 'ZIPPERS',
				description: 'Zipper week',
				discount_type: 'fixed',
				discount_value: 500,
				applies_to: 'products',
				productIds: [bundle],
				min_subtotal: 1000,
				max_redemptions: 50,
				max_redemptions_per_user: 1,
				stackable_with_sale: true,
				is_active: true,
				created_by: admin,
				redemptionCount: 0,
				// Mirrors the old app still reads.
				max_uses: 50,
				min_purchase_amount: 1000
			});
			// Timestamps come back in Postgres text form; compare instants.
			const instants = {
				starts_at: created.starts_at,
				ends_at: created.ends_at,
				valid_from: created.valid_from,
				valid_until: created.valid_until
			};
			expect(
				Object.fromEntries(Object.entries(instants).map(([k, t]) => [k, Date.parse(t!)]))
			).toEqual({
				starts_at: Date.parse(YESTERDAY),
				ends_at: Date.parse(TOMORROW),
				valid_from: Date.parse(YESTERDAY),
				valid_until: Date.parse(TOMORROW)
			});
			const audits = await db().select().from(audit_log);
			expect(audits).toHaveLength(1);
			expect(audits[0]).toMatchObject({
				actor_id: admin,
				action: 'promo.create',
				entity: 'promo_code',
				entity_id: created.id
			});
		});

		it('create refuses a duplicate code', async () => {
			await promo().create(promoInput({ code: 'DUPE' }));
			await expect(promo().create(promoInput({ code: 'DUPE' }))).rejects.toMatchObject({
				code: 'PROMO_CODE_TAKEN'
			});
		});

		it('update changes the terms and clears the scope when switching to all', async () => {
			const bundle = await product('bundle');
			const admin = await user('admin@example.com');
			const created = await promo().create(
				promoInput({ code: 'EDITME', appliesTo: 'products', productIds: [bundle] })
			);
			const updated = await promo().update(
				created.id,
				promoInput({ code: 'EDITED', discountValue: 25, appliesTo: 'all', maxRedemptions: 3 }),
				admin
			);
			expect(updated).toMatchObject({
				id: created.id,
				code: 'EDITED',
				discount_value: 25,
				applies_to: 'all',
				productIds: [],
				max_redemptions: 3
			});
			expect(await promo().getById(created.id)).toMatchObject({ code: 'EDITED', productIds: [] });
			const [audit] = await db()
				.select()
				.from(audit_log)
				.where(eq(audit_log.action, 'promo.update'));
			expect(audit.actor_id).toBe(admin);
			expect(audit.before).toMatchObject({ code: 'EDITME' });
			expect(audit.after).toMatchObject({ code: 'EDITED' });
		});

		it('update keeps the code once it has been redeemed', async () => {
			const buyer = await user('one@example.com');
			const created = await promo().create(promoInput({ code: 'USED' }));
			await reserve(created.id, await order(buyer), buyer);
			const updated = await promo().update(created.id, promoInput({ code: 'RENAMED' }));
			expect(updated.code).toBe('USED');
			expect(updated.redemptionCount).toBe(1);
		});

		it('update refuses an unknown id', async () => {
			await expect(
				promo().update('00000000-0000-4000-8000-000000000000', promoInput())
			).rejects.toBeInstanceOf(DomainError);
		});

		it('setProducts replaces the scope and setActive toggles the switch, both audited', async () => {
			const bundle = await product('bundle');
			const single = await product('single');
			const admin = await user('admin@example.com');
			const created = await promo().create(
				promoInput({ appliesTo: 'products', productIds: [bundle] }),
				admin
			);
			expect(await promo().setProducts(created.id, [single, single], admin)).toEqual([single]);
			expect((await promo().getById(created.id))?.productIds).toEqual([single]);

			const off = await promo().setActive(created.id, false, admin);
			expect(off.is_active).toBe(false);
			const on = await promo().setActive(created.id, true, admin);
			expect(on.is_active).toBe(true);

			const actions = (await db().select({ action: audit_log.action }).from(audit_log)).map(
				(row) => row.action
			);
			expect(actions).toEqual([
				'promo.create',
				'promo.set_products',
				'promo.deactivate',
				'promo.activate'
			]);
		});

		it('bulkGenerate creates distinct single-use codes with the prefix', async () => {
			const bundle = await product('bundle');
			const admin = await user('admin@example.com');
			const rows = await promo().bulkGenerate(
				{
					prefix: 'GIFT',
					count: 5,
					description: 'Giveaway',
					discountType: 'percentage',
					discountValue: 99,
					appliesTo: 'products',
					productIds: [bundle],
					minSubtotal: null,
					startsAt: null,
					endsAt: null,
					isActive: true,
					stackableWithSale: false
				},
				admin
			);
			expect(rows).toHaveLength(5);
			expect(new Set(rows.map((row) => row.code)).size).toBe(5);
			for (const row of rows) {
				expect(row.code).toMatch(/^GIFT-[A-Z2-9]{6}$/);
				expect(row.max_redemptions).toBe(1);
				expect(row.max_uses).toBe(1);
				expect(row.applies_to).toBe('products');
			}
			expect((await promo().getById(rows[0].id))?.productIds).toEqual([bundle]);
			const result = await promo().findValidByCode(rows[0].code, {
				lines: lines([bundle, 2900]),
				now: NOW
			});
			expect(result.ok).toBe(true);

			const [audit] = await db()
				.select()
				.from(audit_log)
				.where(eq(audit_log.action, 'promo.bulk_generate'));
			expect(audit.after).toMatchObject({ prefix: 'GIFT', count: 5 });
			expect((await promo().list()).length).toBe(5);
		});

		it('list counts live redemptions per code and listRedemptions shows the buyer', async () => {
			const alice = await user('alice@example.com');
			const bob = await user('bob@example.com');
			const a = await promo().create(promoInput({ code: 'AAA' }));
			const b = await promo().create(promoInput({ code: 'BBB' }));
			const aliceOrder = await order(alice);
			await reserve(a.id, aliceOrder, alice);
			await reserve(a.id, await order(bob, 'expired'), bob);
			await reserve(b.id, await order(bob, 'refunded'), bob);

			const listed = await promo().list();
			expect(listed.map((row) => [row.code, row.redemptionCount])).toEqual([
				['BBB', 1],
				['AAA', 1]
			]);

			const redemptions = await promo().listRedemptions(a.id);
			expect(redemptions).toHaveLength(2);
			expect(redemptions[0]).toMatchObject({
				orderId: aliceOrder,
				orderStatus: 'paid',
				userId: alice,
				userEmail: 'alice@example.com',
				discountTotal: 290
			});
			expect(redemptions[1].orderStatus).toBe('expired');
		});

		it('does not write audit rows without an actor', async () => {
			await promo().create(promoInput());
			expect(await db().select().from(audit_log)).toHaveLength(0);
			expect(await db().select().from(promo_codes)).toHaveLength(1);
		});
	});
});
