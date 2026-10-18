import { describe, expect, it, vi } from 'vitest';
import type { CataloguePage } from '../../src/lib/server/http/shop.ts';
import { CART_COOKIE_NAME, serializeCart } from '../../src/lib/server/modules/commerce/index.ts';
import { load } from '../../src/routes/(shop)/catalogue/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog } from '../helpers/fixtures.ts';
import { memberEvent } from '../helpers/member.ts';
import { TEST_AUTH_SECRET } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type LoadEvent = Parameters<typeof load>[0];

describe('/catalogue', () => {
	const { db } = useTestDb();

	async function run(
		services: Awaited<ReturnType<typeof seedCatalog>>['services'],
		userId: string | null,
		headers: Record<string, string> = {}
	): Promise<CataloguePage> {
		const event = await memberEvent(services, userId, { url: '/catalogue', headers });
		return (await load(event as unknown as LoadEvent)) as CataloguePage;
	}

	it('groups published products: the flagship first, then bundles, then singles', async () => {
		const { services, flagship, bundle, single } = await seedCatalog(db());
		const page = await run(services, null);

		expect(page.flagship?.product).toMatchObject({
			id: flagship.id,
			slug: 'the-course',
			kind: 'course',
			pricing: { price: 14900, listPrice: 14900, onSale: false, saleEndsAt: null }
		});
		expect(page.bundles.map((card) => card.product.id)).toEqual([bundle.id]);
		expect(page.bundles[0].product).toMatchObject({ itemCount: 2, durationSeconds: 1200 });
		expect(page.singles.map((card) => card.product.id)).toEqual([single.id]);
		expect(page.singles[0].product.pricing.price).toBe(900);
		// Nothing is owned or in the cart for an anonymous visitor without a cookie.
		const cards = [page.flagship, ...page.bundles, ...page.singles];
		expect(cards.map((card) => [card?.owned, card?.inCart])).toEqual([
			[false, false],
			[false, false],
			[false, false]
		]);
	});

	it('flags only the bundle as owned for the bundle owner, and what the cookie holds as in the cart', async () => {
		const { services, single, users } = await seedCatalog(db());
		const cookie = `${CART_COOKIE_NAME}=${serializeCart(
			{ items: [single.id], promoCode: null },
			TEST_AUTH_SECRET
		)}`;
		const page = await run(services, users.bundleOwner.id, { cookie });

		expect(page.flagship?.owned).toBe(false);
		expect(page.bundles.map((card) => card.owned)).toEqual([true]);
		expect(page.singles.map((card) => [card.owned, card.inCart])).toEqual([[false, true]]);
		expect(page.bundles[0].inCart).toBe(false);
	});

	it('flags everything as owned for the all-access member', async () => {
		const { services, users } = await seedCatalog(db());
		const page = await run(services, users.member.id);
		expect([page.flagship, ...page.bundles, ...page.singles].map((card) => card?.owned)).toEqual([
			true,
			true,
			true
		]);
	});

	it('leaves unpublished products out, so only the flagship remains', async () => {
		const { services, bundle, single } = await seedCatalog(db());
		await services.catalog.unpublish(bundle.id);
		await services.catalog.unpublish(single.id);
		const page = await run(services, null);
		expect(page.flagship?.product.slug).toBe('the-course');
		expect(page.bundles).toEqual([]);
		expect(page.singles).toEqual([]);
	});
});
