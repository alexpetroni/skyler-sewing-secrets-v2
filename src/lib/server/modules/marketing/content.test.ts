import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import {
	createTestServices,
	TEST_CONTACT_EMAIL,
	type TestServices
} from '../../../../../tests/helpers/services.ts';
import { schema } from '#lib/server/db/index.ts';
import { createFakeLogger } from '#lib/server/platform/fakes/logger.ts';
import { createRequestLimiter } from '#lib/server/platform/request-limits.ts';
import { DomainError } from '../errors.ts';
import type { BlogPostInput, FaqInput } from './service.ts';
import { createMarketingService } from './service.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, blog_posts, contact_submissions, faq_items, testimonials } = schema;

const HOSTILE_MD =
	'Pressing **matters**.\n\n[x](javascript:alert(1))\n\n<script>steal()</script><p onclick="steal()">Hi</p>';

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
	const err = await promise.then(
		() => null,
		(error: unknown) => error
	);
	expect(err).toBeInstanceOf(DomainError);
	expect((err as DomainError).code).toBe(code);
}

function expectSanitised(html: string): void {
	expect(html).not.toMatch(/<script|onclick|javascript:/i);
}

describe('marketing content', () => {
	const { db } = useTestDb();
	let clock: Date;
	let services: TestServices;
	let adminId: string;
	let memberId: string;

	beforeEach(async () => {
		clock = new Date('2026-10-01T09:00:00.000Z');
		services = createTestServices(db(), { now: () => clock });
		adminId = await services.users.createCredentialUser({
			email: 'admin@example.com',
			password: 'a-good-password',
			fullName: 'Admin'
		});
		memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: 'a-good-password',
			fullName: 'Mary Member'
		});
	});

	async function auditActions(entity: string, entityId: string): Promise<string[]> {
		const rows = await db()
			.select({ action: audit_log.action, actor: audit_log.actor_id })
			.from(audit_log)
			.where(and(eq(audit_log.entity, entity), eq(audit_log.entity_id, entityId)))
			.orderBy(audit_log.created_at);
		for (const row of rows) expect(row.actor).toBe(adminId);
		return rows.map((row) => row.action);
	}

	describe('blog', () => {
		const input = (overrides: Partial<BlogPostInput> = {}): BlogPostInput => ({
			title: 'Pressing seams',
			slug: 'pressing-seams',
			excerpt: 'Why it matters',
			contentMd: HOSTILE_MD,
			featuredImageUrl: '',
			...overrides
		});

		it('renders Markdown to sanitised content_html and mirrors it into the legacy content column', async () => {
			const post = await services.marketing.blog.create(input(), adminId);

			expect(post.content_md).toBe(HOSTILE_MD);
			expect(post.content_html).toContain('<strong>matters</strong>');
			expectSanitised(post.content_html ?? '');
			expect(post.content).toBe(post.content_html);
			expect(post).toMatchObject({
				is_published: false,
				published_at: null,
				author_id: adminId,
				featured_image_url: null
			});
			expect(await auditActions('blog_post', post.id)).toEqual(['blog_post.create']);
		});

		it('sets published_at on the first publish only', async () => {
			const { blog } = services.marketing;
			const post = await blog.create(input(), adminId);

			const published = await blog.publish(post.id, adminId);
			expect(published.is_published).toBe(true);
			expect(published.published_at).toBe('2026-10-01 09:00:00+00');

			clock = new Date('2026-10-05T12:00:00.000Z');
			const unpublished = await blog.unpublish(post.id, adminId);
			expect(unpublished).toMatchObject({
				is_published: false,
				published_at: '2026-10-01 09:00:00+00'
			});
			const republished = await blog.publish(post.id, adminId);
			expect(republished.published_at).toBe('2026-10-01 09:00:00+00');

			expect(await auditActions('blog_post', post.id)).toEqual([
				'blog_post.create',
				'blog_post.publish',
				'blog_post.unpublish',
				'blog_post.publish'
			]);
		});

		it('lists and serves only published posts', async () => {
			const { blog } = services.marketing;
			const draft = await blog.create(input({ slug: 'draft' }), adminId);
			const live = await blog.create(input({ slug: 'live', title: 'Live' }), adminId);
			await blog.publish(live.id, adminId);

			expect((await blog.listPublished()).map((post) => post.slug)).toEqual(['live']);
			expect(await blog.getPublishedBySlug('draft')).toBeNull();
			const view = await blog.getPublishedBySlug('live');
			expect(view?.html).toBe(view?.content_html);
			expect((await blog.listAll()).map((post) => post.id).sort()).toEqual(
				[draft.id, live.id].sort()
			);
		});

		it('sanitises a legacy HTML body on the way out when content_html is null', async () => {
			await db().insert(blog_posts).values({
				title: 'Legacy',
				slug: 'legacy',
				content: '<p onclick="steal()">Old <strong>post</strong></p><script>steal()</script>',
				is_published: true,
				published_at: '2025-01-01T00:00:00Z'
			});

			const view = await services.marketing.blog.getPublishedBySlug('legacy');

			expect(view?.content_html).toBeNull();
			expect(view?.html).toContain('<strong>post</strong>');
			expectSanitised(view?.html ?? '');
		});

		it('re-renders on update, refuses a taken slug and audits the delete', async () => {
			const { blog } = services.marketing;
			const first = await blog.create(input({ slug: 'first' }), adminId);
			await blog.create(input({ slug: 'second' }), adminId);

			const updated = await blog.update(
				first.id,
				input({ slug: 'first', contentMd: '# Hi\n\n_new_' }),
				adminId
			);
			expect(updated.content_html).toContain('<em>new</em>');
			await expectDomainError(
				blog.update(first.id, input({ slug: 'second' }), adminId),
				'SLUG_TAKEN'
			);
			await expectDomainError(blog.create(input({ slug: 'first' }), adminId), 'SLUG_TAKEN');

			await blog.remove(first.id, adminId);
			expect(await blog.getById(first.id)).toBeNull();
			await expectDomainError(blog.remove(first.id, adminId), 'BLOG_POST_NOT_FOUND');
			expect(await auditActions('blog_post', first.id)).toEqual([
				'blog_post.create',
				'blog_post.update',
				'blog_post.delete'
			]);
		});
	});

	describe('faq', () => {
		const input = (overrides: Partial<FaqInput> = {}): FaqInput => ({
			question: 'How long do I have access?',
			answerMd: 'For **life**.',
			category: 'Access',
			orderIndex: 0,
			isPublished: true,
			...overrides
		});

		it('renders the answer Markdown to sanitised answer_html', async () => {
			const item = await services.marketing.faq.create(input({ answerMd: HOSTILE_MD }), adminId);

			expect(item.answer_md).toBe(HOSTILE_MD);
			expect(item.answer_html).toContain('<strong>matters</strong>');
			expectSanitised(item.answer_html ?? '');
			expect(item.answer).toBe(item.answer_html);
			expect(await auditActions('faq_item', item.id)).toEqual(['faq_item.create']);
		});

		it('groups published items by category in order and sanitises legacy answers', async () => {
			const { faq } = services.marketing;
			await faq.create(input({ question: 'Second', category: 'Access', orderIndex: 2 }), adminId);
			await faq.create(input({ question: 'First', category: 'Access', orderIndex: 1 }), adminId);
			await faq.create(input({ question: 'Pay', category: 'Billing' }), adminId);
			await faq.create(input({ question: 'Hidden', isPublished: false }), adminId);
			await db().insert(faq_items).values({
				question: 'Legacy',
				answer: '<p>Yes<img src="x" onerror="steal()"></p>',
				category: null
			});

			const groups = await faq.listPublished();

			expect(
				groups.map((group) => [group.category, group.items.map((item) => item.question)])
			).toEqual([
				['Access', ['First', 'Second']],
				['Billing', ['Pay']],
				[null, ['Legacy']]
			]);
			expect(groups[0].items[0].html).toBe('<p>For <strong>life</strong>.</p>\n');
			const legacy = groups[2].items[0].html;
			expect(legacy).toContain('Yes');
			expect(legacy).not.toMatch(/onerror/);
		});

		it('updates and removes with audit entries', async () => {
			const { faq } = services.marketing;
			const item = await faq.create(input(), adminId);

			const updated = await faq.update(
				item.id,
				input({ answerMd: '_Always_', category: '' }),
				adminId
			);
			expect(updated).toMatchObject({ answer_html: '<p><em>Always</em></p>\n', category: null });
			await faq.remove(item.id, adminId);
			expect(await faq.getById(item.id)).toBeNull();
			await expectDomainError(faq.update(item.id, input(), adminId), 'FAQ_NOT_FOUND');
			expect(await auditActions('faq_item', item.id)).toEqual([
				'faq_item.create',
				'faq_item.update',
				'faq_item.delete'
			]);
		});
	});

	describe('testimonials', () => {
		const submission = (content = 'The pressing lesson changed how I sew.') => ({
			userId: memberId,
			content,
			rating: 5,
			authorTitle: ' Home sewist '
		});

		it('submits unpublished, lets the member edit it, then refuses edits once published', async () => {
			const { testimonials: reviews } = services.marketing;

			const created = await reviews.submit(submission());
			expect(created).toMatchObject({
				user_id: memberId,
				author_name: 'Mary Member',
				author_title: 'Home sewist',
				rating: 5,
				is_published: false,
				is_featured: false
			});

			const edited = await reviews.submit({
				...submission('Edited: still the best course around.'),
				rating: 4
			});
			expect(edited.id).toBe(created.id);
			expect(edited).toMatchObject({ content: 'Edited: still the best course around.', rating: 4 });

			await reviews.setPublished(created.id, true, adminId);
			await expectDomainError(
				reviews.submit(submission('Trying to change it after publication.')),
				'REVIEW_PUBLISHED'
			);

			const rows = await db().select().from(testimonials).where(eq(testimonials.user_id, memberId));
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				content: 'Edited: still the best course around.',
				is_published: true
			});
			expect(await reviews.forUser(memberId)).toMatchObject({ id: created.id });
			expect(await auditActions('testimonial', created.id)).toEqual(['testimonial.publish']);
		});

		it('lists published testimonials and the featured ones up to the limit', async () => {
			const { testimonials: reviews } = services.marketing;
			const rows = await db()
				.insert(testimonials)
				.values([
					{ author_name: 'A', content: 'a', is_published: true, is_featured: true, order_index: 2 },
					{ author_name: 'B', content: 'b', is_published: true, is_featured: true, order_index: 1 },
					{
						author_name: 'C',
						content: 'c',
						is_published: true,
						is_featured: false,
						order_index: 0
					},
					{ author_name: 'D', content: 'd', is_published: false, is_featured: true, order_index: 0 }
				])
				.returning();

			expect((await reviews.featured(1)).map((row) => row.author_name)).toEqual(['B']);
			expect((await reviews.featured(6)).map((row) => row.author_name)).toEqual(['B', 'A']);
			expect((await reviews.listPublished()).map((row) => row.author_name)).toEqual([
				'C',
				'B',
				'A'
			]);

			const updated = await reviews.update(
				rows[3].id,
				{
					authorName: 'Dee',
					authorTitle: '',
					content: 'Edited by admin',
					rating: 3,
					isFeatured: false,
					orderIndex: 9,
					country: 'UK'
				},
				adminId
			);
			expect(updated).toMatchObject({
				author_name: 'Dee',
				author_title: null,
				country: 'UK',
				order_index: 9
			});
			await reviews.remove(rows[3].id, adminId);
			expect((await reviews.listAll()).map((row) => row.author_name).sort()).toEqual([
				'A',
				'B',
				'C'
			]);
			expect(await auditActions('testimonial', rows[3].id)).toEqual([
				'testimonial.update',
				'testimonial.delete'
			]);
		});
	});

	describe('contact', () => {
		const message = {
			name: 'Jane Doe',
			email: 'jane@example.com',
			subject: '',
			message: 'Hello, I have a question about the course.'
		};

		it('stores the submission and notifies contactEmail with replyTo set to the sender', async () => {
			const { id } = await services.marketing.contact.submit(message);

			const [row] = await db()
				.select()
				.from(contact_submissions)
				.where(eq(contact_submissions.id, id));
			expect(row).toMatchObject({
				name: 'Jane Doe',
				email: 'jane@example.com',
				subject: null,
				message: message.message,
				is_read: false
			});
			expect(services.mailer.sent).toHaveLength(1);
			expect(services.mailer.sent[0]).toMatchObject({
				to: TEST_CONTACT_EMAIL,
				replyTo: 'jane@example.com',
				subject: 'New Contact Form Submission: No Subject'
			});
			expect(services.mailer.sent[0].text).toContain(message.message);
			expect(JSON.stringify(services.logEntries)).not.toContain('jane@example.com');
		});

		it('keeps the submission when the notification fails', async () => {
			const log = createFakeLogger();
			const marketing = createMarketingService({
				db: db(),
				mailer: {
					async send() {
						throw new Error('Resend send failed with 500');
					}
				},
				limiter: createRequestLimiter({ db: db() }),
				log,
				siteUrl: 'http://localhost:5173',
				secret: 'secret',
				contactEmail: TEST_CONTACT_EMAIL
			});

			const { id } = await marketing.contact.submit(message);

			expect((await marketing.contact.list()).map((row) => row.id)).toEqual([id]);
			expect(log.entries.find((entry) => entry.level === 'error')).toMatchObject({
				message: 'contact notification email failed',
				fields: { submissionId: id, error: 'Resend send failed with 500' }
			});
			expect(JSON.stringify(log.entries)).not.toContain('jane@example.com');
		});

		it('marks a submission read with an audit entry', async () => {
			const { contact } = services.marketing;
			const { id } = await contact.submit(message);

			expect(await contact.markRead(id, adminId)).toMatchObject({ id, is_read: true });
			expect(await auditActions('contact_submission', id)).toEqual([
				'contact_submission.mark_read'
			]);
		});
	});
});
