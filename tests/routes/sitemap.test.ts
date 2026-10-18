import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/routes/sitemap.xml/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog } from '../helpers/fixtures.ts';
import type { TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));
vi.mock('$app/env/public', () => ({ PUBLIC_SITE_URL: 'https://skylersewingsecrets.com' }));

type GetEvent = Parameters<typeof GET>[0];

describe('/sitemap.xml', () => {
	const { db } = useTestDb();
	let services: TestServices;

	beforeEach(async () => {
		({ services } = await seedCatalog(db()));
		const adminId = await services.users.createCredentialUser({
			email: 'admin@example.com',
			password: 'a-good-password',
			fullName: 'Admin'
		});
		const blog = services.marketing.blog;
		const input = { title: 'Post', excerpt: '', contentMd: 'Body', featuredImageUrl: '' };
		const published = await blog.create({ ...input, slug: 'pressing-seams' }, adminId);
		await blog.publish(published.id, adminId);
		await blog.create({ ...input, slug: 'draft-post' }, adminId);
	});

	it('lists the static pages, published blog posts and published products', async () => {
		const response = await GET(
			fakeEvent({ url: '/sitemap.xml', locals: { services } }) as unknown as GetEvent
		);
		const xml = await response.text();
		const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

		expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(locs).toEqual([
			'https://skylersewingsecrets.com/',
			'https://skylersewingsecrets.com/about',
			'https://skylersewingsecrets.com/fabric-library',
			'https://skylersewingsecrets.com/faq',
			'https://skylersewingsecrets.com/blog',
			'https://skylersewingsecrets.com/testimonials',
			'https://skylersewingsecrets.com/contact',
			'https://skylersewingsecrets.com/legal/terms-and-conditions',
			'https://skylersewingsecrets.com/legal/privacy',
			'https://skylersewingsecrets.com/legal/claims',
			'https://skylersewingsecrets.com/blog/pressing-seams',
			'https://skylersewingsecrets.com/products/the-course',
			'https://skylersewingsecrets.com/products/basics-bundle',
			'https://skylersewingsecrets.com/products/standalone-video'
		]);
	});
});
