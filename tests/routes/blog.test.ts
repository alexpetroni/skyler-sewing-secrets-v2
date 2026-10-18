import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load as listLoad } from '../../src/routes/(marketing)/blog/+page.server.ts';
import { load as postLoad } from '../../src/routes/(marketing)/blog/[slug]/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListEvent = Parameters<typeof listLoad>[0];
type PostEvent = Parameters<typeof postLoad>[0];
/** `load` is typed to allow `void`; these loads always return their page data. */
type ListData = import('../../src/routes/(marketing)/blog/$types').PageServerData;
type PostData = import('../../src/routes/(marketing)/blog/[slug]/$types').PageServerData;

describe('blog routes', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;

	beforeEach(async () => {
		services = createTestServices(db());
		adminId = await services.users.createCredentialUser({
			email: 'admin@example.com',
			password: 'a-good-password',
			fullName: 'Admin'
		});
	});

	async function post(slug: string, contentMd: string, publish: boolean) {
		const created = await services.marketing.blog.create(
			{ title: `Title ${slug}`, slug, excerpt: '', contentMd, featuredImageUrl: '' },
			adminId
		);
		if (publish) await services.marketing.blog.publish(created.id, adminId);
		return created;
	}

	function openPost(slug: string) {
		const event = {
			...fakeEvent({ url: `/blog/${slug}`, locals: { services } }),
			params: { slug }
		};
		return postLoad(event as unknown as PostEvent) as Promise<PostData>;
	}

	async function status(promise: Promise<unknown>): Promise<number | null> {
		try {
			await promise;
			return null;
		} catch (error) {
			if (isHttpError(error)) return error.status;
			throw error;
		}
	}

	it('serves a published post with its sanitised html body', async () => {
		await post('pressing', 'Pressing **matters**.\n\n<script>steal()</script>', true);

		const data = await openPost('pressing');

		expect(data.post.title).toBe('Title pressing');
		expect(data.post.html).toContain('<strong>matters</strong>');
		expect(data.post.html).not.toContain('<script');
	});

	it('answers 404 for an unpublished slug and for an unknown one', async () => {
		await post('draft', 'Not yet', false);

		expect(await status(openPost('draft'))).toBe(404);
		expect(await status(openPost('no-such-post'))).toBe(404);
	});

	it('lists only published posts', async () => {
		await post('published', 'Out', true);
		await post('draft', 'Not yet', false);

		const data = (await listLoad(
			fakeEvent({ url: '/blog', locals: { services } }) as unknown as ListEvent
		)) as ListData;

		expect(data.posts.map((p) => p.slug)).toEqual(['published']);
	});
});
