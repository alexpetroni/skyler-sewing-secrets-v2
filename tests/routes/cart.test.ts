import { isActionFailure } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { CartPage } from '../../src/lib/server/http/shop.ts';
import {
	CART_COOKIE_NAME,
	cartCookieOptions,
	parseCart,
	serializeCart,
	type CartState
} from '../../src/lib/server/modules/commerce/index.ts';
import type { Services } from '../../src/lib/server/runtime/container.ts';
import { PROMO_REJECTION_MESSAGES } from '../../src/lib/shared/promo-messages.ts';
import type { PromoInput } from '../../src/lib/shared/schemas/commerce.ts';
import { actions, load } from '../../src/routes/(shop)/cart/+page.server.ts';
import { load as layoutLoad } from '../../src/routes/+layout.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent } from '../helpers/member.ts';
import { TEST_AUTH_SECRET } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ActionName = keyof typeof actions;
type ActionEvent = Parameters<(typeof actions)['add']>[0];
type LoadEvent = Parameters<typeof load>[0];
type LayoutEvent = Parameters<typeof layoutLoad>[0];

function cookieHeader(state: CartState): Record<string, string> {
	return { cookie: `${CART_COOKIE_NAME}=${serializeCart(state, TEST_AUTH_SECRET)}` };
}

function cart(items: string[], promoCode: string | null = null): CartState {
	return { items, promoCode };
}

function promoInput(overrides: Partial<PromoInput> & Pick<PromoInput, 'code'>): PromoInput {
	return {
		description: '',
		discountType: 'percentage',
		discountValue: 20,
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

describe('/cart', () => {
	const { db } = useTestDb();

	/** Runs an action with the given cookie state and form fields. */
	async function act(
		seeded: SeededCatalog,
		name: ActionName,
		{
			userId = null,
			state = cart([]),
			fields = {}
		}: { userId?: string | null; state?: CartState; fields?: Record<string, string> } = {}
	) {
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: `/cart?/${name}`,
			headers: cookieHeader(state),
			body: new URLSearchParams(fields)
		});
		const result = await actions[name](event as unknown as ActionEvent);
		const written = event.setCookies.filter((call) => call.name === CART_COOKIE_NAME);
		return {
			result,
			written,
			/** The state the action wrote, or null when it wrote no cookie. */
			next: written.length > 0 ? parseCart(written.at(-1)?.value, TEST_AUTH_SECRET) : null
		};
	}

	async function render(seeded: SeededCatalog, state: CartState, userId: string | null = null) {
		const event = await memberEvent(seeded.services, userId, {
			url: '/cart',
			headers: cookieHeader(state)
		});
		const data = (await load(event as unknown as LoadEvent)) as CartPage;
		const written = event.setCookies.filter((call) => call.name === CART_COOKIE_NAME);
		return {
			data,
			next: written.length > 0 ? parseCart(written.at(-1)?.value, TEST_AUTH_SECRET) : null
		};
	}

	it('add sets a signed httpOnly lax cookie on / holding the one item', async () => {
		const seeded = await seedCatalog(db());
		const { result, written, next } = await act(seeded, 'add', {
			fields: { productId: seeded.bundle.id }
		});

		expect(result).toEqual({ added: seeded.bundle.id });
		expect(written).toHaveLength(1);
		expect(written[0].options).toEqual(cartCookieOptions(false));
		expect(written[0].options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
		expect(next).toEqual(cart([seeded.bundle.id]));
		// Signed: the value only parses with the server's secret.
		expect(parseCart(written[0].value, 'another-secret')).toEqual(cart([]));
	});

	it('add refuses an unpublished product, an unknown id and a malformed id with 400', async () => {
		const seeded = await seedCatalog(db());
		await seeded.services.catalog.unpublish(seeded.single.id);
		for (const productId of [
			seeded.single.id,
			'00000000-0000-4000-8000-000000000042',
			'not-a-uuid'
		]) {
			const { result, written } = await act(seeded, 'add', {
				state: cart([seeded.bundle.id]),
				fields: { productId }
			});
			if (!isActionFailure(result)) throw new Error(`expected a failure for ${productId}`);
			expect(result.status).toBe(400);
			expect(result.data).toEqual({ error: 'That product is not available.' });
			expect(written).toEqual([]);
		}
	});

	it('add of an owned product leaves the items unchanged and the next quote reports it removed as owned, once', async () => {
		const seeded = await seedCatalog(db());
		const owner = seeded.users.bundleOwner.id;
		const before = cart([seeded.single.id]);
		const { result, next } = await act(seeded, 'add', {
			userId: owner,
			state: before,
			fields: { productId: seeded.bundle.id }
		});

		expect(isActionFailure(result)).toBe(false);
		if (!next) throw new Error('expected the cookie to be written');
		expect(next.items).toEqual(before.items);
		expect(next.promoCode).toBeNull();

		const first = await render(seeded, next, owner);
		expect(first.data.quote.removed).toEqual([{ productId: seeded.bundle.id, reason: 'owned' }]);
		expect(first.data.quote.lines.map((line) => line.productId)).toEqual([seeded.single.id]);
		// The load acknowledges the notice, so the following render is quiet.
		expect(first.next).toEqual(before);
		if (!first.next) throw new Error('expected the load to rewrite the cookie');
		const second = await render(seeded, first.next, owner);
		expect(second.data.quote.removed).toEqual([]);
		expect(second.next).toBeNull();
	});

	it('applyPromo with an unknown, malformed or expired code fails with the mapped promoError text', async () => {
		const seeded = await seedCatalog(db());
		await seeded.services.commerce.promo.create(
			promoInput({
				code: 'SUMMER',
				startsAt: '2025-06-01T00:00:00Z',
				endsAt: '2025-09-01T00:00:00Z'
			})
		);
		const state = cart([seeded.bundle.id]);
		const cases: Array<[string, string]> = [
			['NOPE', PROMO_REJECTION_MESSAGES.not_found],
			['x', PROMO_REJECTION_MESSAGES.not_found],
			['summer', PROMO_REJECTION_MESSAGES.expired]
		];
		for (const [code, message] of cases) {
			const { result, written } = await act(seeded, 'applyPromo', { state, fields: { code } });
			if (!isActionFailure(result)) throw new Error(`expected a failure for ${code}`);
			expect(result.status).toBe(400);
			expect(result.data).toEqual({ promoError: message });
			expect(written).toEqual([]);
		}
		expect(PROMO_REJECTION_MESSAGES.expired).toBe('This code has expired.');
	});

	it('applyPromo normalises a scoped code, stores it and discounts only the eligible line', async () => {
		const seeded = await seedCatalog(db());
		await seeded.services.commerce.promo.create(
			promoInput({ code: 'BUNDLE20', appliesTo: 'products', productIds: [seeded.bundle.id] })
		);
		const state = cart([seeded.bundle.id, seeded.single.id]);
		const { result, next } = await act(seeded, 'applyPromo', {
			userId: seeded.users.nobody.id,
			state,
			fields: { code: '  bundle20 ' }
		});

		expect(result).toEqual({ promoApplied: 'BUNDLE20' });
		expect(next).toEqual(cart([seeded.bundle.id, seeded.single.id], 'BUNDLE20'));

		if (!next) throw new Error('expected the cookie to be written');
		const { data } = await render(seeded, next, seeded.users.nobody.id);
		const { quote } = data;
		expect(quote.promo?.code).toBe('BUNDLE20');
		expect(quote.rejection).toBeNull();
		expect(quote.lines.map((line) => [line.productId, line.discount, line.unitAmount])).toEqual([
			[seeded.bundle.id, 580, 2320],
			[seeded.single.id, 0, 900]
		]);
		expect(quote.subtotal).toBe(3800);
		expect(quote.discountTotal).toBe(580);
		expect(quote.total).toBe(3220);
	});

	it('remove drops one product and keeps the rest and the code', async () => {
		const seeded = await seedCatalog(db());
		const { result, next } = await act(seeded, 'remove', {
			state: cart([seeded.bundle.id, seeded.single.id], 'SPRING20'),
			fields: { productId: seeded.bundle.id }
		});
		expect(result).toEqual({ removed: seeded.bundle.id });
		expect(next).toEqual(cart([seeded.single.id], 'SPRING20'));

		const malformed = await act(seeded, 'remove', { fields: { productId: 'nope' } });
		if (!isActionFailure(malformed.result)) throw new Error('expected a failure');
		expect(malformed.result.status).toBe(400);
		expect(malformed.written).toEqual([]);
	});

	it('clear empties the cart and removePromo drops only the code', async () => {
		const seeded = await seedCatalog(db());
		const full = cart([seeded.bundle.id, seeded.single.id], 'SPRING20');

		const cleared = await act(seeded, 'clear', { state: full });
		expect(cleared.result).toEqual({ cleared: true });
		expect(cleared.next).toEqual(cart([]));

		const noCode = await act(seeded, 'removePromo', { state: full });
		expect(noCode.result).toEqual({ promoRemoved: true });
		expect(noCode.next).toEqual(cart([seeded.bundle.id, seeded.single.id]));
	});

	it('the load explains unpublished and course-covered removals once and suggests the course', async () => {
		const seeded = await seedCatalog(db());
		await seeded.services.catalog.unpublish(seeded.single.id);

		const withCourse = await render(
			seeded,
			cart([seeded.bundle.id, seeded.flagship.id, seeded.single.id])
		);
		expect(withCourse.data.quote.lines.map((line) => line.productId)).toEqual([seeded.flagship.id]);
		expect(withCourse.data.quote.removed).toEqual([
			{ productId: seeded.single.id, reason: 'unpublished' },
			{ productId: seeded.bundle.id, reason: 'included_in_course' }
		]);
		expect(withCourse.next).toEqual(cart([seeded.flagship.id]));
		expect(withCourse.data.flagship).toBeNull();

		// No removals: the cookie is left alone. A cart worth ≥ 60% of the course suggests it.
		const quiet = await render(seeded, cart([seeded.bundle.id]));
		expect(quiet.next).toBeNull();
		expect(quiet.data.quote.suggestFlagship).toBe(false);
		expect(quiet.data.flagship).toBeNull();

		await seeded.services.catalog.update(seeded.bundle.id, {
			kind: 'bundle',
			slug: 'basics-bundle',
			title: 'basics-bundle',
			tagline: '',
			descriptionMd: 'About basics-bundle',
			coverImageUrl: 'https://cdn.example.com/basics-bundle.jpg',
			price: 9000,
			salePrice: null,
			saleStartsAt: null,
			saleEndsAt: null,
			isFeatured: false,
			sortOrder: 0
		});
		const nudged = await render(seeded, cart([seeded.bundle.id]));
		expect(nudged.data.quote.suggestFlagship).toBe(true);
		expect(nudged.data.flagship).toEqual({
			id: seeded.flagship.id,
			slug: 'the-course',
			title: 'the-course',
			price: 14900
		});
	});
});

describe('root layout cartCount', () => {
	const { db } = useTestDb();

	it('counts the items in the signed cookie with no database in reach', async () => {
		const seeded = await seedCatalog(db());
		// Only the cookie codec: a database query would throw on the missing services.
		const services = {
			commerce: { cartCookie: seeded.services.commerce.cartCookie }
		} as unknown as Services;
		const run = (headers: Record<string, string>) =>
			layoutLoad(
				fakeEvent({
					headers,
					locals: { services, profile: null, maintenanceMode: false }
				}) as unknown as LayoutEvent
			);

		expect(run(cookieHeader(cart([seeded.bundle.id, seeded.single.id])))).toMatchObject({
			cartCount: 2,
			viewer: null
		});
		expect(run({})).toMatchObject({ cartCount: 0 });
		expect(
			run({ cookie: `${CART_COOKIE_NAME}=${serializeCart(cart([seeded.bundle.id]), 'forged')}` })
		).toMatchObject({ cartCount: 0 });
	});
});
