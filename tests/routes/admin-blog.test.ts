import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { load as listLoad } from '../../src/routes/admin/content/blog/+page.server.ts';
import {
	actions as newActions,
	load as newLoad
} from '../../src/routes/admin/content/blog/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/content/blog/[id]/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListData = import('../../src/routes/admin/content/blog/$types').PageServerData;
type EditData = import('../../src/routes/admin/content/blog/[id]/$types').PageServerData;

const postFields = {
	title: 'Pressing seams',
	slug: 'pressing-seams',
	excerpt: 'Why the iron matters',
	featuredImageUrl: 'https://cdn.example.com/press.jpg',
	contentMd: '## Press as you go\n\n**Always** press.<script>alert(1)</script>'
};

const LEGACY_HTML = '<p>Old <b>post</b> from the first site</p>';

describe('/admin/content/blog', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;
	let memberId: string;
	let clock: Date;

	beforeEach(async () => {
		clock = new Date('2026-03-01T09:00:00.000Z');
		services = createTestServices(db(), { now: () => clock });
		adminId = await createAdmin(services);
		memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD
		});
	});

	async function getPost(id: string) {
		const [row] = await db().select().from(schema.blog_posts).where(eq(schema.blog_posts.id, id));
		return row;
	}

	async function createPost(fields: Record<string, string> = postFields): Promise<string> {
		const result = String(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/blog/new?/create',
				fields
			})
		);
		expect(result).toMatch(/^redirect 303 \/admin\/content\/blog\/[0-9a-f-]{36}$/);
		return result.split('/').pop() ?? '';
	}

	it('lists posts for admins only', async () => {
		const id = await createPost();
		const data = (await runLoad(services, adminId, listLoad, {
			url: '/admin/content/blog'
		})) as ListData;
		expect(data.posts.map((post) => [post.id, post.slug, post.is_published])).toEqual([
			[id, 'pressing-seams', false]
		]);

		expect(await runLoad(services, memberId, listLoad, { url: '/admin/content/blog' })).toBe(
			'redirect 303 /'
		);
		expect(await runLoad(services, adminId, newLoad, { url: '/admin/content/blog/new' })).toEqual(
			expect.objectContaining({ form: expect.objectContaining({ id: 'post' }) })
		);
	});

	it('saves Markdown as sanitised content_html, as a draft, with an audit row', async () => {
		const id = await createPost();
		const post = await getPost(id);
		// Form submissions carry CRLF line breaks.
		expect(post.content_md?.replaceAll('\r\n', '\n')).toBe(postFields.contentMd);
		expect(post.content_html).toContain('<h2>Press as you go</h2>');
		expect(post.content_html).toContain('<strong>Always</strong>');
		expect(post.content_html).not.toContain('<script');
		expect(post.content_html).not.toContain('alert(1)');
		// The legacy app still reads `content`; it gets the same sanitised HTML.
		expect(post.content).toBe(post.content_html);
		expect(post).toMatchObject({ is_published: false, published_at: null, author_id: adminId });
		expect(await auditActions(services, id)).toEqual(['blog_post.create']);
	});

	it('refuses a new post without content, and a taken slug, on their fields', async () => {
		const empty = failed(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/blog/new?/create',
				fields: { ...postFields, contentMd: '  ' }
			})
		);
		expect(empty.status).toBe(400);
		expect(empty.form.errors.contentMd).toEqual(['Content is required']);

		await createPost();
		const taken = failed(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/blog/new?/create',
				fields: { ...postFields, title: 'Another' }
			})
		);
		expect(taken.form.errors.slug).toEqual(['This slug is already in use']);
		expect(await services.marketing.blog.listAll()).toHaveLength(1);
	});

	it('sets published_at once across publish → unpublish → publish', async () => {
		const id = await createPost();
		const at = (path: string) => ({
			url: `/admin/content/blog/${id}?/${path}`,
			params: { id }
		});

		const published = (await submitAction(
			services,
			adminId,
			editActions.publish,
			at('publish')
		)) as {
			form: { message: string };
		};
		expect(published.form.message).toBe('Post published.');
		const first = await getPost(id);
		expect(first.is_published).toBe(true);
		expect(new Date(first.published_at ?? '').toISOString()).toBe('2026-03-01T09:00:00.000Z');

		clock = new Date('2026-03-05T12:00:00.000Z');
		await submitAction(services, adminId, editActions.unpublish, at('unpublish'));
		const unpublished = await getPost(id);
		expect(unpublished.is_published).toBe(false);
		expect(unpublished.published_at).toBe(first.published_at);

		clock = new Date('2026-03-09T15:00:00.000Z');
		await submitAction(services, adminId, editActions.publish, at('publish'));
		const republished = await getPost(id);
		expect(republished.is_published).toBe(true);
		expect(republished.published_at).toBe(first.published_at);

		expect(await auditActions(services, id)).toEqual([
			'blog_post.create',
			'blog_post.publish',
			'blog_post.unpublish',
			'blog_post.publish'
		]);
	});

	it('keeps a legacy HTML post untouched when other fields are saved without Markdown', async () => {
		const [legacy] = await db()
			.insert(schema.blog_posts)
			.values({ title: 'Old post', slug: 'old-post', content: LEGACY_HTML })
			.returning();
		const edit = (await runLoad(services, adminId, editLoad, {
			url: `/admin/content/blog/${legacy.id}`,
			params: { id: legacy.id }
		})) as EditData;
		expect(edit.post).toMatchObject({ content: LEGACY_HTML, content_md: null, content_html: null });

		const saved = (await submitAction(services, adminId, editActions.update, {
			url: `/admin/content/blog/${legacy.id}?/update`,
			params: { id: legacy.id },
			fields: {
				title: 'Old post, retitled',
				slug: 'old-post',
				excerpt: 'New excerpt',
				featuredImageUrl: '',
				contentMd: ''
			}
		})) as { form: { message: string } };
		expect(saved.form.message).toBe('Post updated successfully.');
		const kept = await getPost(legacy.id);
		expect(kept).toMatchObject({
			title: 'Old post, retitled',
			excerpt: 'New excerpt',
			content: LEGACY_HTML,
			content_md: null,
			content_html: null
		});
		expect(await auditActions(services, legacy.id)).toEqual(['blog_post.update']);

		// Markdown, once written, replaces the HTML.
		await submitAction(services, adminId, editActions.update, {
			url: `/admin/content/blog/${legacy.id}?/update`,
			params: { id: legacy.id },
			fields: { title: 'Old post', slug: 'old-post', contentMd: 'Now in *Markdown*' }
		});
		const converted = await getPost(legacy.id);
		expect(converted.content_md).toBe('Now in *Markdown*');
		expect(converted.content_html).toBe('<p>Now in <em>Markdown</em></p>\n');
		expect(converted.content).toBe(converted.content_html);
	});

	it('deletes a post only with the typed phrase, and 404s on unknown ids', async () => {
		const id = await createPost();
		const wrong = failed(
			await submitAction(services, adminId, editActions.delete, {
				url: `/admin/content/blog/${id}?/delete`,
				params: { id },
				fields: { confirm: 'nope' }
			})
		);
		expect(wrong.form.errors.confirm).toEqual(['Type the phrase exactly to confirm']);
		expect(await getPost(id)).toBeDefined();

		expect(
			await submitAction(services, adminId, editActions.delete, {
				url: `/admin/content/blog/${id}?/delete`,
				params: { id },
				fields: { confirm: 'delete' }
			})
		).toBe('redirect 303 /admin/content/blog');
		expect(await getPost(id)).toBeUndefined();
		expect(await auditActions(services, id)).toEqual(['blog_post.create', 'blog_post.delete']);

		expect(
			await runLoad(services, adminId, editLoad, {
				url: `/admin/content/blog/${id}`,
				params: { id }
			})
		).toBe('error 404');
		expect(
			await runLoad(services, adminId, editLoad, {
				url: '/admin/content/blog/not-a-uuid',
				params: { id: 'not-a-uuid' }
			})
		).toBe('error 404');
	});

	it('refuses non-admin writes with 403', async () => {
		const id = await createPost();
		expect(
			await submitAction(services, memberId, editActions.publish, {
				url: `/admin/content/blog/${id}?/publish`,
				params: { id }
			})
		).toBe('error 403');
		expect((await getPost(id)).is_published).toBe(false);
	});
});
