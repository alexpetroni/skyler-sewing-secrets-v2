import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../../../../../tests/helpers/fixtures.ts';
import { CART_MAX_ITEMS } from '#lib/shared/schemas/commerce.ts';
import {
	acknowledgeRemovals,
	addItem,
	CART_COOKIE_NAME,
	cartCookieOptions,
	clear,
	createCartCookie,
	emptyCart,
	parseCart,
	removeItem,
	serializeCart,
	setPromo,
	type CartState
} from './cart.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const SECRET = 'cart-signing-secret';
const NOW = new Date('2026-10-18T12:00:00Z');

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

describe('cart cookie codec', () => {
	const state: CartState = { items: [uuid(1), uuid(2)], promoCode: 'SPRING20' };

	it('round-trips a signed value', () => {
		const value = serializeCart(state, SECRET);
		expect(value).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
		expect(parseCart(value, SECRET)).toEqual(state);
	});

	it('returns an empty cart for a tampered payload or signature, without throwing', () => {
		const value = serializeCart(state, SECRET);
		const [payload, signature] = value.split('.');
		const forged = Buffer.from(
			JSON.stringify({ items: [uuid(9)], promoCode: null }),
			'utf8'
		).toString('base64url');
		const bad = [
			`${forged}.${signature}`,
			`${payload}.${signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`,
			`${payload}.${signature.slice(1)}`,
			`${payload}.`,
			`.${signature}`,
			payload,
			'',
			'not-a-cookie',
			'..',
			serializeCart(state, 'another-secret')
		];
		for (const value of bad) {
			expect(parseCart(value, SECRET)).toEqual(emptyCart());
		}
		expect(parseCart(undefined, SECRET)).toEqual(emptyCart());
		expect(parseCart(null, SECRET)).toEqual(emptyCart());
	});

	it('returns an empty cart for a correctly signed value of the wrong shape', () => {
		// `serializeCart` only signs well-formed state, so sign arbitrary JSON with the same HMAC.
		const signed = (json: string) => {
			const payload = Buffer.from(json, 'utf8').toString('base64url');
			return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('hex')}`;
		};
		expect(parseCart(signed('not json'), SECRET)).toEqual(emptyCart());
		expect(parseCart(signed('[]'), SECRET)).toEqual(emptyCart());
		expect(parseCart(signed('{"items":"x","promoCode":null}'), SECRET)).toEqual(emptyCart());
		expect(parseCart(signed('{"items":["not-a-uuid"],"promoCode":null}'), SECRET)).toEqual(
			emptyCart()
		);
		expect(parseCart(signed(`{"items":["${uuid(1)}"]}`), SECRET)).toEqual(emptyCart());
		expect(parseCart(signed(`{"items":["${uuid(1)}"],"promoCode":"bad code"}`), SECRET)).toEqual(
			emptyCart()
		);
		// And the same JSON, well-formed, is accepted: the rejections above are about shape, not signing.
		expect(parseCart(signed(`{"items":["${uuid(1)}"],"promoCode":null}`), SECRET)).toEqual({
			items: [uuid(1)],
			promoCode: null
		});
	});

	it('truncates beyond the item limit and drops duplicates', () => {
		const many = Array.from({ length: CART_MAX_ITEMS + 5 }, (_, i) => uuid(i + 1));
		const parsed = parseCart(serializeCart({ items: many, promoCode: null }, SECRET), SECRET);
		expect(parsed.items).toEqual(many.slice(0, CART_MAX_ITEMS));

		const doubled = parseCart(
			serializeCart({ items: [uuid(1), uuid(2), uuid(1)], promoCode: null }, SECRET),
			SECRET
		);
		expect(doubled.items).toEqual([uuid(1), uuid(2)]);
	});

	it('names the cookie and sets the browser attributes', () => {
		expect(cartCookieOptions(true)).toEqual({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 30 * 24 * 60 * 60
		});
		expect(cartCookieOptions(false).secure).toBe(false);
	});

	it('keeps pending removal notices through a round trip and omits the key when there are none', () => {
		const withNotice: CartState = {
			...state,
			removed: [{ productId: uuid(3), reason: 'owned' }]
		};
		expect(parseCart(serializeCart(withNotice, SECRET), SECRET)).toEqual(withNotice);
		expect(parseCart(serializeCart({ ...state, removed: [] }, SECRET), SECRET)).not.toHaveProperty(
			'removed'
		);
		const badReason = Buffer.from(
			JSON.stringify({ ...state, removed: [{ productId: uuid(3), reason: 'stolen' }] })
		).toString('base64url');
		const signedBad = `${badReason}.${createHmac('sha256', SECRET).update(badReason).digest('hex')}`;
		expect(parseCart(signedBad, SECRET)).toEqual(emptyCart());
	});

	it('createCartCookie writes a signed, httpOnly lax cookie on / and reads it back', () => {
		const jar = new Map<string, string>();
		const calls: Array<{ name: string; options: ReturnType<typeof cartCookieOptions> }> = [];
		const cookies = {
			get: (name: string) => jar.get(name),
			set: (name: string, value: string, options: ReturnType<typeof cartCookieOptions>) => {
				jar.set(name, value);
				calls.push({ name, options });
			}
		};
		const codec = createCartCookie({ secret: SECRET, secure: true });
		expect(codec.read(cookies)).toEqual(emptyCart());
		codec.write(cookies, state);
		expect(calls).toEqual([{ name: CART_COOKIE_NAME, options: cartCookieOptions(true) }]);
		expect(jar.get(CART_COOKIE_NAME)).toBe(serializeCart(state, SECRET));
		expect(codec.read(cookies)).toEqual(state);
		// A different secret does not accept the value.
		expect(createCartCookie({ secret: 'other', secure: true }).read(cookies)).toEqual(emptyCart());
	});
});

describe('cart state helpers', () => {
	it('addItem appends once and refuses past the limit', () => {
		let state = emptyCart();
		state = addItem(state, uuid(1));
		state = addItem(state, uuid(1));
		expect(state.items).toEqual([uuid(1)]);
		for (let i = 2; i <= CART_MAX_ITEMS + 2; i += 1) state = addItem(state, uuid(i));
		expect(state.items).toHaveLength(CART_MAX_ITEMS);
		expect(state.items.at(-1)).toBe(uuid(CART_MAX_ITEMS));
	});

	it('removeItem, setPromo and clear return new state', () => {
		const state: CartState = { items: [uuid(1), uuid(2)], promoCode: null };
		const removed = removeItem(state, uuid(1));
		expect(removed.items).toEqual([uuid(2)]);
		expect(state.items).toEqual([uuid(1), uuid(2)]);
		expect(removeItem(state, uuid(7)).items).toEqual(state.items);
		expect(setPromo(state, 'SPRING20')).toEqual({ ...state, promoCode: 'SPRING20' });
		expect(setPromo(setPromo(state, 'SPRING20'), null).promoCode).toBeNull();
		expect(clear()).toEqual({ items: [], promoCode: null });
	});

	it('acknowledgeRemovals keeps the quoted lines and the code and drops pending notices', () => {
		const state: CartState = {
			items: [uuid(1), uuid(2), uuid(3)],
			promoCode: 'SPRING20',
			removed: [{ productId: uuid(4), reason: 'owned' }]
		};
		const quote = { lines: [{ productId: uuid(1) }, { productId: uuid(3) }] };
		expect(acknowledgeRemovals(state, quote)).toEqual({
			items: [uuid(1), uuid(3)],
			promoCode: 'SPRING20'
		});
	});
});

describe('createCartService', () => {
	const { db } = useTestDb();

	async function seeded(): Promise<SeededCatalog> {
		return seedCatalog(db());
	}

	const state = (items: string[], promoCode: string | null = null): CartState => ({
		items,
		promoCode
	});

	describe('resolve', () => {
		it('keeps purchasable items in order for a visitor who owns nothing', async () => {
			const s = await seeded();
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.single.id, s.bundle.id]),
				{ id: s.users.nobody.id },
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.single.id, s.bundle.id]);
			expect(lines[0]).toMatchObject({
				slug: 'standalone-video',
				kind: 'single',
				listPrice: 900,
				effectivePrice: 900,
				onSale: false
			});
			expect(removed).toEqual([]);
		});

		it('works for a signed-out visitor', async () => {
			const s = await seeded();
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.bundle.id]),
				null,
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.bundle.id]);
			expect(removed).toEqual([]);
		});

		it('removes products the viewer already owns', async () => {
			const s = await seeded();
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.bundle.id, s.single.id]),
				{ id: s.users.bundleOwner.id },
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.single.id]);
			expect(removed).toEqual([{ productId: s.bundle.id, reason: 'owned' }]);
		});

		it('removes everything for an all-access member', async () => {
			const s = await seeded();
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.flagship.id, s.bundle.id, s.single.id]),
				{ id: s.users.member.id },
				NOW
			);
			expect(lines).toEqual([]);
			expect(removed.map((r) => r.reason)).toEqual(['owned', 'owned', 'owned']);
		});

		it('removes unpublished and unknown products', async () => {
			const s = await seeded();
			await s.services.catalog.unpublish(s.single.id);
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.single.id, uuid(42), s.bundle.id]),
				{ id: s.users.nobody.id },
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.bundle.id]);
			expect(removed).toEqual([
				{ productId: s.single.id, reason: 'unpublished' },
				{ productId: uuid(42), reason: 'unpublished' }
			]);
		});

		it('the flagship removes every other line, wherever it sits', async () => {
			const s = await seeded();
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.single.id, s.flagship.id, s.bundle.id]),
				{ id: s.users.nobody.id },
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.flagship.id]);
			expect(removed).toEqual([
				{ productId: s.single.id, reason: 'included_in_course' },
				{ productId: s.bundle.id, reason: 'included_in_course' }
			]);
		});

		it('collapses duplicates, keeping the first position', async () => {
			const s = await seeded();
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.bundle.id, s.single.id, s.bundle.id]),
				null,
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.bundle.id, s.single.id]);
			expect(removed).toEqual([{ productId: s.bundle.id, reason: 'duplicate' }]);
		});

		it('an owned flagship in the cart does not evict the other lines', async () => {
			const s = await seeded();
			// The bundle owner does not own the course; a visitor who does is the member case above.
			const { lines, removed } = await s.services.commerce.cart.resolve(
				state([s.bundle.id, s.single.id]),
				{ id: s.users.bundleOwner.id },
				NOW
			);
			expect(lines.map((l) => l.productId)).toEqual([s.single.id]);
			expect(removed).toEqual([{ productId: s.bundle.id, reason: 'owned' }]);
		});
	});

	describe('add', () => {
		it('appends a published product the viewer does not own', async () => {
			const s = await seeded();
			const result = await s.services.commerce.cart.add(
				state([s.single.id]),
				s.bundle.id,
				{ id: s.users.nobody.id },
				NOW
			);
			expect(result).toEqual({ ok: true, state: state([s.single.id, s.bundle.id]) });
		});

		it('refuses unpublished and unknown products', async () => {
			const s = await seeded();
			await s.services.catalog.unpublish(s.single.id);
			const cart = s.services.commerce.cart;
			expect(await cart.add(emptyCart(), s.single.id, null, NOW)).toEqual({
				ok: false,
				reason: 'unpublished'
			});
			expect(await cart.add(emptyCart(), uuid(42), null, NOW)).toEqual({
				ok: false,
				reason: 'unpublished'
			});
		});

		it('keeps an owned product out of the items and queues an owned notice for the next quote only', async () => {
			const s = await seeded();
			const cart = s.services.commerce.cart;
			const owner = { id: s.users.bundleOwner.id };
			const result = await cart.add(state([s.single.id]), s.bundle.id, owner, NOW);
			if (!result.ok) throw new Error('expected the add to succeed');
			expect(result.state.items).toEqual([s.single.id]);

			const quote = await cart.quote(result.state, owner, NOW);
			expect(quote.lines.map((l) => l.productId)).toEqual([s.single.id]);
			expect(quote.removed).toEqual([{ productId: s.bundle.id, reason: 'owned' }]);

			const after = await cart.quote(acknowledgeRemovals(result.state, quote), owner, NOW);
			expect(after.removed).toEqual([]);
			expect(after.lines.map((l) => l.productId)).toEqual([s.single.id]);
		});
	});

	describe('quote', () => {
		it('applies a scoped code to the right lines only', async () => {
			const s = await seeded();
			const code = await s.services.commerce.promo.create({
				code: 'SINGLE50',
				description: '',
				discountType: 'percentage',
				discountValue: 50,
				appliesTo: 'products',
				productIds: [s.single.id],
				minSubtotal: null,
				maxRedemptions: null,
				maxRedemptionsPerUser: null,
				startsAt: null,
				endsAt: null,
				isActive: true,
				stackableWithSale: false
			});
			const quote = await s.services.commerce.cart.quote(
				state([s.bundle.id, s.single.id], 'SINGLE50'),
				{ id: s.users.nobody.id },
				NOW
			);
			expect(quote.lines.map((l) => [l.productId, l.discount, l.unitAmount])).toEqual([
				[s.bundle.id, 0, 2900],
				[s.single.id, 450, 450]
			]);
			expect(quote).toMatchObject({
				subtotal: 3800,
				discountTotal: 450,
				total: 3350,
				promo: { code: 'SINGLE50', id: code.id },
				promoCode: 'SINGLE50',
				rejection: null,
				removed: [],
				suggestFlagship: false
			});
			expect(quote.lines.reduce((sum, l) => sum + l.unitAmount, 0)).toBe(quote.total);
		});

		it('keeps a rejected code visible with its reason and charges the subtotal', async () => {
			const s = await seeded();
			const quote = await s.services.commerce.cart.quote(
				state([s.bundle.id], 'NOSUCHCODE'),
				null,
				NOW
			);
			expect(quote).toMatchObject({
				subtotal: 2900,
				discountTotal: 0,
				total: 2900,
				promo: null,
				promoCode: 'NOSUCHCODE',
				rejection: 'not_found'
			});
		});

		it('rejects a code whose only eligible product the viewer already owns', async () => {
			const s = await seeded();
			await s.services.commerce.promo.create({
				code: 'BUNDLE10',
				description: '',
				discountType: 'percentage',
				discountValue: 10,
				appliesTo: 'products',
				productIds: [s.bundle.id],
				minSubtotal: null,
				maxRedemptions: null,
				maxRedemptionsPerUser: null,
				startsAt: null,
				endsAt: null,
				isActive: true,
				stackableWithSale: false
			});
			const quote = await s.services.commerce.cart.quote(
				state([s.bundle.id, s.single.id], 'BUNDLE10'),
				{ id: s.users.bundleOwner.id },
				NOW
			);
			expect(quote.removed).toEqual([{ productId: s.bundle.id, reason: 'owned' }]);
			expect(quote.rejection).toBe('not_eligible');
			expect(quote.total).toBe(900);
		});

		it('quotes an empty cart and a cart without a code', async () => {
			const s = await seeded();
			const empty = await s.services.commerce.cart.quote(emptyCart(), null, NOW);
			expect(empty).toMatchObject({
				lines: [],
				subtotal: 0,
				total: 0,
				promo: null,
				promoCode: null,
				rejection: null,
				suggestFlagship: false
			});
			const plain = await s.services.commerce.cart.quote(state([s.single.id]), null, NOW);
			expect(plain).toMatchObject({ total: 900, promo: null, rejection: null });
		});

		it('suggests the flagship once the total reaches 60% of its price, unless it is in the cart', async () => {
			const s = await seeded();
			const { catalog } = s.services;
			const big = await catalog.create({
				kind: 'bundle',
				slug: 'big-bundle',
				title: 'Big bundle',
				tagline: '',
				descriptionMd: 'Lots',
				coverImageUrl: 'https://cdn.example.com/big.jpg',
				price: 6000,
				salePrice: null,
				saleStartsAt: null,
				saleEndsAt: null,
				isFeatured: false,
				sortOrder: 0
			});
			await catalog.setItems(big.id, [s.lessons.first, s.lessons.second]);
			await catalog.publish(big.id);
			const cart = s.services.commerce.cart;

			// 6000 + 2900 = 8900 < 8940
			expect((await cart.quote(state([big.id, s.bundle.id]), null, NOW)).suggestFlagship).toBe(
				false
			);
			// 6000 + 2900 + 900 = 9800 ≥ 8940
			expect(
				(await cart.quote(state([big.id, s.bundle.id, s.single.id]), null, NOW)).suggestFlagship
			).toBe(true);
			// The course itself in the cart: nothing to suggest.
			expect((await cart.quote(state([s.flagship.id, big.id]), null, NOW)).suggestFlagship).toBe(
				false
			);

			// A code that pulls the total under the threshold removes the suggestion.
			await s.services.commerce.promo.create({
				code: 'TENOFF',
				description: '',
				discountType: 'fixed',
				discountValue: 1000,
				appliesTo: 'all',
				productIds: [],
				minSubtotal: null,
				maxRedemptions: null,
				maxRedemptionsPerUser: null,
				startsAt: null,
				endsAt: null,
				isActive: true,
				stackableWithSale: false
			});
			const discounted = await cart.quote(
				state([big.id, s.bundle.id, s.single.id], 'TENOFF'),
				null,
				NOW
			);
			expect(discounted.total).toBe(8800);
			expect(discounted.suggestFlagship).toBe(false);
		});
	});
});
