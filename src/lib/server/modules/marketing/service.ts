import { and, asc, desc, eq, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type { Logger, Mailer, RequestLimiter } from '#lib/server/platform/index.ts';
import type { ContactInput } from '#lib/shared/schemas/marketing.ts';
import { renderMarkdown } from '../content/index.ts';
import { DomainError } from '../errors.ts';
import { writeAudit } from './audit.ts';
import { contactNotificationEmail } from './emails.ts';
import { createNewsletterService, type NewsletterService } from './newsletter.ts';
import {
	createScreen,
	type ScreenInput,
	type ScreenResult,
	type VerifyTurnstile
} from './screen.ts';
import { createSettingsService, type SettingsService } from './settings.ts';

const { blog_posts, faq_items, testimonials, contact_submissions, profiles } = schema;

export type BlogPost = typeof blog_posts.$inferSelect;
export type FaqItem = typeof faq_items.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
export type ContactSubmission = typeof contact_submissions.$inferSelect;

/** A published post for display; `html` is always sanitiser output. */
export interface BlogPostView extends BlogPost {
	html: string;
}

export type BlogPostSummary = Pick<
	BlogPost,
	'id' | 'title' | 'slug' | 'excerpt' | 'featured_image_url' | 'published_at' | 'created_at'
>;

export interface BlogPostInput {
	title: string;
	slug: string;
	excerpt: string;
	/**
	 * The Markdown body; null or blank leaves the stored content as it is (a
	 * legacy post whose HTML has not been converted). A new post needs one.
	 */
	contentMd: string | null;
	featuredImageUrl: string;
}

export interface FaqView {
	id: string;
	question: string;
	category: string | null;
	orderIndex: number;
	/** Sanitiser output. */
	html: string;
}

export interface FaqGroup {
	category: string | null;
	items: FaqView[];
}

export interface FaqInput {
	question: string;
	answerMd: string;
	category: string;
	orderIndex: number;
	isPublished: boolean;
}

export interface TestimonialSubmission {
	userId: string;
	content: string;
	rating: number;
	authorTitle: string;
}

export interface TestimonialInput {
	authorName: string;
	authorTitle: string;
	content: string;
	rating: number | null;
	isFeatured: boolean;
	orderIndex: number;
	country: string;
}

export interface MarketingService {
	/** Anti-abuse gate for the public newsletter and contact submissions. */
	screen(input: ScreenInput): Promise<ScreenResult>;
	blog: {
		/** Published posts, newest first, without their bodies. */
		listPublished(): Promise<BlogPostSummary[]>;
		getPublishedBySlug(slug: string): Promise<BlogPostView | null>;
		listAll(): Promise<BlogPost[]>;
		getById(id: string): Promise<BlogPost | null>;
		/** Created unpublished; `content_html` (and the legacy `content`) rendered from Markdown. */
		create(input: BlogPostInput, actorId: string): Promise<BlogPost>;
		/** Re-renders the content only when `contentMd` is given. */
		update(id: string, input: BlogPostInput, actorId: string): Promise<BlogPost>;
		/** Sets `published_at` the first time only; republishing keeps the original date. */
		publish(id: string, actorId: string): Promise<BlogPost>;
		unpublish(id: string, actorId: string): Promise<BlogPost>;
		remove(id: string, actorId: string): Promise<void>;
	};
	faq: {
		/** Published items grouped by category (category, then order). */
		listPublished(): Promise<FaqGroup[]>;
		listAll(): Promise<FaqItem[]>;
		getById(id: string): Promise<FaqItem | null>;
		create(input: FaqInput, actorId: string): Promise<FaqItem>;
		update(id: string, input: FaqInput, actorId: string): Promise<FaqItem>;
		/**
		 * Swaps the item with its neighbour within its category and renumbers
		 * that category from 0; a no-op at either end.
		 */
		move(id: string, direction: 'up' | 'down', actorId: string): Promise<void>;
		remove(id: string, actorId: string): Promise<void>;
	};
	testimonials: {
		/** Published and featured, by `order_index`. */
		featured(limit: number): Promise<Testimonial[]>;
		listPublished(): Promise<Testimonial[]>;
		/** The member's own testimonial, if any. */
		forUser(userId: string): Promise<Testimonial | null>;
		/**
		 * Creates the member's testimonial unpublished, or edits it while it is
		 * unpublished; refuses with `REVIEW_PUBLISHED` once it is published.
		 */
		submit(input: TestimonialSubmission): Promise<Testimonial>;
		listAll(): Promise<Testimonial[]>;
		update(id: string, input: TestimonialInput, actorId: string): Promise<Testimonial>;
		setPublished(id: string, published: boolean, actorId: string): Promise<Testimonial>;
		remove(id: string, actorId: string): Promise<void>;
	};
	contact: {
		/** Stores the message, then notifies `contactEmail` with `replyTo` set to the sender. */
		submit(input: ContactInput): Promise<{ id: string }>;
		list(): Promise<ContactSubmission[]>;
		markRead(id: string, actorId: string): Promise<ContactSubmission>;
	};
	newsletter: NewsletterService;
	settings: SettingsService;
}

export interface CreateMarketingServiceDeps {
	db: Db;
	mailer: Mailer;
	limiter: RequestLimiter;
	log: Logger;
	siteUrl: string;
	/** Key for the newsletter unsubscribe HMAC. */
	secret: string;
	/** Where contact-form notifications go. */
	contactEmail: string;
	/** Present only when Turnstile is configured. */
	verifyTurnstile?: VerifyTurnstile;
	now?: () => Date;
	/** How long `settings.isMaintenanceMode()` caches the flag; 30 seconds by default. */
	maintenanceCacheMs?: number;
}

function blank(value: string): string | null {
	return value.trim() === '' ? null : value.trim();
}

function blogValues(input: BlogPostInput) {
	return {
		title: input.title,
		slug: input.slug,
		excerpt: blank(input.excerpt),
		featured_image_url: blank(input.featuredImageUrl)
	};
}

/** The Markdown body when one was given; a blank one counts as not given. */
function givenMarkdown(input: BlogPostInput): string | null {
	return input.contentMd?.trim() ? input.contentMd : null;
}

function blogContentValues(contentMd: string) {
	// Always recomputed: HTML is never accepted from a caller. The legacy
	// `content` column gets the same sanitised HTML while the legacy app runs.
	const html = renderMarkdown(contentMd);
	return { content_md: contentMd, content_html: html, content: html };
}

function faqValues(input: FaqInput) {
	const html = renderMarkdown(input.answerMd);
	return {
		question: input.question,
		answer_md: input.answerMd,
		answer_html: html,
		answer: html,
		category: blank(input.category),
		order_index: input.orderIndex,
		is_published: input.isPublished
	};
}

function testimonialValues(input: TestimonialInput) {
	return {
		author_name: input.authorName,
		author_title: blank(input.authorTitle),
		content: input.content,
		rating: input.rating,
		is_featured: input.isFeatured,
		order_index: input.orderIndex,
		country: blank(input.country)
	};
}

export function createMarketingService(deps: CreateMarketingServiceDeps): MarketingService {
	const { db, mailer, limiter, log, siteUrl, secret, contactEmail, verifyTurnstile } = deps;
	const now = deps.now ?? (() => new Date());

	async function requireRow<T>(rows: Promise<T[]>, code: string, message: string): Promise<T> {
		const [row] = await rows;
		if (!row) throw new DomainError(code, message);
		return row;
	}

	const requirePost = (executor: Db | Tx, id: string) =>
		requireRow(
			executor.select().from(blog_posts).where(eq(blog_posts.id, id)).limit(1),
			'BLOG_POST_NOT_FOUND',
			'Blog post not found'
		);
	const requireFaq = (executor: Db | Tx, id: string) =>
		requireRow(
			executor.select().from(faq_items).where(eq(faq_items.id, id)).limit(1),
			'FAQ_NOT_FOUND',
			'FAQ item not found'
		);
	const requireTestimonial = (executor: Db | Tx, id: string) =>
		requireRow(
			executor.select().from(testimonials).where(eq(testimonials.id, id)).limit(1),
			'TESTIMONIAL_NOT_FOUND',
			'Testimonial not found'
		);

	async function assertSlugFree(tx: Tx, slug: string, exceptId?: string): Promise<void> {
		const filters: SQL[] = [eq(blog_posts.slug, slug)];
		if (exceptId) filters.push(ne(blog_posts.id, exceptId));
		const [taken] = await tx
			.select({ id: blog_posts.id })
			.from(blog_posts)
			.where(and(...filters))
			.limit(1);
		if (taken) throw new DomainError('SLUG_TAKEN', 'This slug is already in use');
	}

	function setPostPublished(id: string, published: boolean, actorId: string): Promise<BlogPost> {
		return withTx(db, async (tx) => {
			const before = await requirePost(tx, id);
			const [after] = await tx
				.update(blog_posts)
				.set({
					is_published: published,
					// The first publication date is kept across unpublish/publish.
					published_at: published
						? sql`coalesce(${blog_posts.published_at}, ${now().toISOString()}::timestamptz)`
						: before.published_at,
					updated_at: sql`now()`
				})
				.where(eq(blog_posts.id, id))
				.returning();
			await writeAudit(tx, {
				actorId,
				action: published ? 'blog_post.publish' : 'blog_post.unpublish',
				entity: 'blog_post',
				entityId: id,
				before: { is_published: before.is_published, published_at: before.published_at },
				after: { is_published: after.is_published, published_at: after.published_at }
			});
			return after;
		});
	}

	function faqView(row: FaqItem): FaqView {
		return {
			id: row.id,
			question: row.question,
			category: row.category,
			orderIndex: row.order_index,
			// Legacy rows hold HTML in `answer`; it is sanitised on the way out.
			html: row.answer_html ?? renderMarkdown(row.answer)
		};
	}

	const blog: MarketingService['blog'] = {
		listPublished() {
			return db
				.select({
					id: blog_posts.id,
					title: blog_posts.title,
					slug: blog_posts.slug,
					excerpt: blog_posts.excerpt,
					featured_image_url: blog_posts.featured_image_url,
					published_at: blog_posts.published_at,
					created_at: blog_posts.created_at
				})
				.from(blog_posts)
				.where(eq(blog_posts.is_published, true))
				.orderBy(desc(blog_posts.published_at), desc(blog_posts.created_at));
		},

		async getPublishedBySlug(slug) {
			const [row] = await db
				.select()
				.from(blog_posts)
				.where(and(eq(blog_posts.slug, slug), eq(blog_posts.is_published, true)))
				.limit(1);
			if (!row) return null;
			// Legacy rows hold HTML in `content`; it is sanitised on the way out.
			return { ...row, html: row.content_html ?? renderMarkdown(row.content) };
		},

		listAll() {
			return db.select().from(blog_posts).orderBy(desc(blog_posts.created_at));
		},

		async getById(id) {
			const [row] = await db.select().from(blog_posts).where(eq(blog_posts.id, id)).limit(1);
			return row ?? null;
		},

		create: (input, actorId) =>
			withTx(db, async (tx) => {
				const contentMd = givenMarkdown(input);
				if (contentMd === null) throw new DomainError('CONTENT_REQUIRED', 'Content is required');
				await assertSlugFree(tx, input.slug);
				const [post] = await tx
					.insert(blog_posts)
					.values({
						...blogValues(input),
						...blogContentValues(contentMd),
						author_id: actorId,
						is_published: false
					})
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'blog_post.create',
					entity: 'blog_post',
					entityId: post.id,
					before: null,
					after: post
				});
				log.info('blog post created', { blogPostId: post.id });
				return post;
			}),

		update: (id, input, actorId) =>
			withTx(db, async (tx) => {
				const before = await requirePost(tx, id);
				await assertSlugFree(tx, input.slug, id);
				const contentMd = givenMarkdown(input);
				const [after] = await tx
					.update(blog_posts)
					.set({
						...blogValues(input),
						// A legacy post keeps its stored HTML until Markdown is written for it.
						...(contentMd === null ? {} : blogContentValues(contentMd)),
						updated_at: sql`now()`
					})
					.where(eq(blog_posts.id, id))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'blog_post.update',
					entity: 'blog_post',
					entityId: id,
					before,
					after
				});
				return after;
			}),

		publish: (id, actorId) => setPostPublished(id, true, actorId),
		unpublish: (id, actorId) => setPostPublished(id, false, actorId),

		remove: (id, actorId) =>
			withTx(db, async (tx) => {
				const before = await requirePost(tx, id);
				await tx.delete(blog_posts).where(eq(blog_posts.id, id));
				await writeAudit(tx, {
					actorId,
					action: 'blog_post.delete',
					entity: 'blog_post',
					entityId: id,
					before,
					after: null
				});
				log.info('blog post deleted', { blogPostId: id });
			})
	};

	const faq: MarketingService['faq'] = {
		async listPublished() {
			const rows = await db
				.select()
				.from(faq_items)
				.where(eq(faq_items.is_published, true))
				.orderBy(asc(faq_items.category), asc(faq_items.order_index), asc(faq_items.created_at));
			const groups: FaqGroup[] = [];
			for (const row of rows) {
				const last = groups.at(-1);
				if (last && last.category === row.category) last.items.push(faqView(row));
				else groups.push({ category: row.category, items: [faqView(row)] });
			}
			return groups;
		},

		listAll() {
			return db
				.select()
				.from(faq_items)
				.orderBy(asc(faq_items.category), asc(faq_items.order_index), asc(faq_items.created_at));
		},

		async getById(id) {
			const [row] = await db.select().from(faq_items).where(eq(faq_items.id, id)).limit(1);
			return row ?? null;
		},

		create: (input, actorId) =>
			withTx(db, async (tx) => {
				const [item] = await tx.insert(faq_items).values(faqValues(input)).returning();
				await writeAudit(tx, {
					actorId,
					action: 'faq_item.create',
					entity: 'faq_item',
					entityId: item.id,
					before: null,
					after: item
				});
				return item;
			}),

		update: (id, input, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireFaq(tx, id);
				const [after] = await tx
					.update(faq_items)
					.set({ ...faqValues(input), updated_at: sql`now()` })
					.where(eq(faq_items.id, id))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'faq_item.update',
					entity: 'faq_item',
					entityId: id,
					before,
					after
				});
				return after;
			}),

		move: (id, direction, actorId) =>
			withTx(db, async (tx) => {
				const item = await requireFaq(tx, id);
				// Locks the category's rows so two moves cannot interleave.
				const ordered = await tx
					.select({ id: faq_items.id, orderIndex: faq_items.order_index })
					.from(faq_items)
					.where(
						item.category === null
							? isNull(faq_items.category)
							: eq(faq_items.category, item.category)
					)
					.orderBy(asc(faq_items.order_index), asc(faq_items.created_at))
					.for('update');
				const index = ordered.findIndex((row) => row.id === id);
				const target = direction === 'up' ? index - 1 : index + 1;
				if (target < 0 || target >= ordered.length) return;
				const ids = ordered.map((row) => row.id);
				[ids[index], ids[target]] = [ids[target], ids[index]];
				for (const [position, rowId] of ids.entries()) {
					await tx
						.update(faq_items)
						.set({ order_index: position, updated_at: sql`now()` })
						.where(eq(faq_items.id, rowId));
				}
				await writeAudit(tx, {
					actorId,
					action: 'faq_item.move',
					entity: 'faq_item',
					entityId: id,
					before: { order_index: ordered[index].orderIndex },
					after: { order_index: target, direction }
				});
			}),

		remove: (id, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireFaq(tx, id);
				await tx.delete(faq_items).where(eq(faq_items.id, id));
				await writeAudit(tx, {
					actorId,
					action: 'faq_item.delete',
					entity: 'faq_item',
					entityId: id,
					before,
					after: null
				});
			})
	};

	const PUBLISHED_ORDER = [asc(testimonials.order_index), desc(testimonials.created_at)];

	const testimonialsNs: MarketingService['testimonials'] = {
		featured(limit) {
			return db
				.select()
				.from(testimonials)
				.where(and(eq(testimonials.is_published, true), eq(testimonials.is_featured, true)))
				.orderBy(...PUBLISHED_ORDER)
				.limit(limit);
		},

		listPublished() {
			return db
				.select()
				.from(testimonials)
				.where(eq(testimonials.is_published, true))
				.orderBy(...PUBLISHED_ORDER);
		},

		async forUser(userId) {
			const [row] = await db
				.select()
				.from(testimonials)
				.where(eq(testimonials.user_id, userId))
				.orderBy(desc(testimonials.created_at))
				.limit(1);
			return row ?? null;
		},

		submit: ({ userId, content, rating, authorTitle }) =>
			withTx(db, async (tx) => {
				const profile = await requireRow(
					tx
						.select({ full_name: profiles.full_name, avatar_url: profiles.avatar_url })
						.from(profiles)
						.where(eq(profiles.id, userId))
						.limit(1),
					'PROFILE_NOT_FOUND',
					'Profile not found'
				);
				const values = {
					content: content.trim(),
					rating,
					author_name: profile.full_name || 'Member',
					author_title: blank(authorTitle),
					author_avatar_url: profile.avatar_url
				};
				// Only the member's own row is ever touched.
				const [existing] = await tx
					.select({ id: testimonials.id, is_published: testimonials.is_published })
					.from(testimonials)
					.where(eq(testimonials.user_id, userId))
					.orderBy(desc(testimonials.created_at))
					.limit(1);
				if (existing?.is_published) {
					throw new DomainError(
						'REVIEW_PUBLISHED',
						'Your review has already been published and cannot be edited.'
					);
				}
				if (existing) {
					const [updated] = await tx
						.update(testimonials)
						.set({ ...values, updated_at: sql`now()` })
						.where(eq(testimonials.id, existing.id))
						.returning();
					log.info('testimonial updated by member', { testimonialId: updated.id, userId });
					return updated;
				}
				const [created] = await tx
					.insert(testimonials)
					.values({ ...values, user_id: userId, is_published: false, is_featured: false })
					.returning();
				log.info('testimonial submitted', { testimonialId: created.id, userId });
				return created;
			}),

		listAll() {
			return db.select().from(testimonials).orderBy(desc(testimonials.created_at));
		},

		update: (id, input, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireTestimonial(tx, id);
				const [after] = await tx
					.update(testimonials)
					.set({ ...testimonialValues(input), updated_at: sql`now()` })
					.where(eq(testimonials.id, id))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'testimonial.update',
					entity: 'testimonial',
					entityId: id,
					before,
					after
				});
				return after;
			}),

		setPublished: (id, published, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireTestimonial(tx, id);
				const [after] = await tx
					.update(testimonials)
					.set({ is_published: published, updated_at: sql`now()` })
					.where(eq(testimonials.id, id))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: published ? 'testimonial.publish' : 'testimonial.unpublish',
					entity: 'testimonial',
					entityId: id,
					before: { is_published: before.is_published },
					after: { is_published: after.is_published }
				});
				return after;
			}),

		remove: (id, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireTestimonial(tx, id);
				await tx.delete(testimonials).where(eq(testimonials.id, id));
				await writeAudit(tx, {
					actorId,
					action: 'testimonial.delete',
					entity: 'testimonial',
					entityId: id,
					before,
					after: null
				});
			})
	};

	const contact: MarketingService['contact'] = {
		async submit(input) {
			const [row] = await db
				.insert(contact_submissions)
				.values({
					name: input.name,
					email: input.email,
					subject: input.subject || null,
					message: input.message
				})
				.returning({ id: contact_submissions.id });
			log.info('contact submission stored', { submissionId: row.id });

			// The message is stored and listed in the admin inbox even if the
			// notification cannot be sent.
			try {
				await mailer.send({
					to: contactEmail,
					replyTo: input.email,
					...contactNotificationEmail({
						name: input.name,
						email: input.email,
						subject: input.subject || null,
						message: input.message
					})
				});
			} catch (err) {
				log.error('contact notification email failed', {
					submissionId: row.id,
					error: err instanceof Error ? err.message : String(err)
				});
			}
			return { id: row.id };
		},

		list() {
			return db.select().from(contact_submissions).orderBy(desc(contact_submissions.created_at));
		},

		markRead: (id, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireRow(
					tx.select().from(contact_submissions).where(eq(contact_submissions.id, id)).limit(1),
					'CONTACT_NOT_FOUND',
					'Contact submission not found'
				);
				const [after] = await tx
					.update(contact_submissions)
					.set({ is_read: true })
					.where(eq(contact_submissions.id, id))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'contact_submission.mark_read',
					entity: 'contact_submission',
					entityId: id,
					before: { is_read: before.is_read },
					after: { is_read: after.is_read }
				});
				return after;
			})
	};

	return {
		screen: createScreen({ limiter, log, verifyTurnstile }),
		blog,
		faq,
		testimonials: testimonialsNs,
		contact,
		newsletter: createNewsletterService({ db, mailer, log, siteUrl, secret, now }),
		settings: createSettingsService({
			db,
			log,
			now,
			maintenanceCacheMs: deps.maintenanceCacheMs
		})
	};
}
