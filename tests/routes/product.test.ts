import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import type { ProductPage } from '../../src/lib/server/http/shop.ts';
import { CART_COOKIE_NAME, serializeCart } from '../../src/lib/server/modules/commerce/index.ts';
import { load } from '../../src/routes/(shop)/products/[slug]/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { TEST_AUTH_SECRET } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type LoadEvent = Parameters<typeof load>[0];

describe('/products/[slug]', () => {
	const { db } = useTestDb();

	async function run(
		seeded: SeededCatalog,
		userId: string | null,
		slug: string,
		headers: Record<string, string> = {}
	) {
		const event = await memberEvent(seeded.services, userId, {
			url: `/products/${slug}`,
			params: { slug },
			headers
		});
		return outcome(() => load(event as unknown as LoadEvent) as Promise<ProductPage>);
	}

	async function page(...args: Parameters<typeof run>): Promise<ProductPage> {
		const result = await run(...args);
		if (typeof result === 'string') throw new Error(`expected a page, got ${result}`);
		return result;
	}

	it('returns 404 for an unpublished product and an unknown slug', async () => {
		const seeded = await seedCatalog(db());
		await seeded.services.catalog.unpublish(seeded.bundle.id);
		expect(await run(seeded, null, 'basics-bundle')).toBe('error 404');
		expect(await run(seeded, seeded.users.bundleOwner.id, 'basics-bundle')).toBe('error 404');
		expect(await run(seeded, null, 'no-such-product')).toBe('error 404');
	});

	it('shows a bundle with its description, lessons, durations and free-preview links', async () => {
		const seeded = await seedCatalog(db());
		await db()
			.update(schema.lessons)
			.set({ is_free_preview: true })
			.where(eq(schema.lessons.id, seeded.lessons.first));
		const data = await page(seeded, null, 'basics-bundle');

		expect(data.product).toMatchObject({ id: seeded.bundle.id, kind: 'bundle', itemCount: 2 });
		expect(data.descriptionHtml).toContain('About basics-bundle');
		expect(data.isFlagship).toBe(false);
		expect(data.outline).toEqual([]);
		expect(data.lessons).toEqual([
			{
				id: seeded.lessons.first,
				title: 'first-lesson',
				durationSeconds: 600,
				previewHref: '/modules/basics/first-lesson'
			},
			{
				id: seeded.lessons.second,
				title: 'second-lesson',
				durationSeconds: 600,
				previewHref: null
			}
		]);
		expect(data.owned).toBe(false);
		expect(data.inCart).toBe(false);
	});

	it('lists the course outline by module on the flagship page', async () => {
		const seeded = await seedCatalog(db());
		const data = await page(seeded, null, 'the-course');
		expect(data.isFlagship).toBe(true);
		expect(data.lessons).toEqual([]);
		expect(data.outline).toEqual([
			{
				title: 'Basics',
				lessons: [
					expect.objectContaining({ id: seeded.lessons.first, title: 'first-lesson' }),
					expect.objectContaining({ id: seeded.lessons.second, title: 'second-lesson' })
				]
			}
		]);
	});

	it('is owned for its owner and the all-access member, not for anyone else', async () => {
		const seeded = await seedCatalog(db());
		const { member, bundleOwner, nobody } = seeded.users;
		expect((await page(seeded, bundleOwner.id, 'basics-bundle')).owned).toBe(true);
		expect((await page(seeded, member.id, 'basics-bundle')).owned).toBe(true);
		expect((await page(seeded, nobody.id, 'basics-bundle')).owned).toBe(false);
		expect((await page(seeded, bundleOwner.id, 'standalone-video')).owned).toBe(false);
		expect((await page(seeded, bundleOwner.id, 'the-course')).owned).toBe(false);
	});

	it('reports the product as in the cart when the signed cookie holds it', async () => {
		const seeded = await seedCatalog(db());
		const cookie = `${CART_COOKIE_NAME}=${serializeCart(
			{ items: [seeded.single.id], promoCode: null },
			TEST_AUTH_SECRET
		)}`;
		expect((await page(seeded, null, 'standalone-video', { cookie })).inCart).toBe(true);
		expect((await page(seeded, null, 'basics-bundle', { cookie })).inCart).toBe(false);
		// A cookie signed with another secret is ignored.
		const forged = `${CART_COOKIE_NAME}=${serializeCart(
			{ items: [seeded.single.id], promoCode: null },
			'some-other-secret'
		)}`;
		expect((await page(seeded, null, 'standalone-video', { cookie: forged })).inCart).toBe(false);
	});
});
