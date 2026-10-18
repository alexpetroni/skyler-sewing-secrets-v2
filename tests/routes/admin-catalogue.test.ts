import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { GET as searchLessons } from '../../src/routes/admin/api/lessons/+server.ts';
import { load as listLoad } from '../../src/routes/admin/catalogue/+page.server.ts';
import {
	actions as newActions,
	load as newLoad
} from '../../src/routes/admin/catalogue/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/catalogue/[id]/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListData = import('../../src/routes/admin/catalogue/$types').PageServerData;
type NewData = import('../../src/routes/admin/catalogue/new/$types').PageServerData;
type EditData = import('../../src/routes/admin/catalogue/[id]/$types').PageServerData;
type SearchEvent = Parameters<typeof searchLessons>[0];

interface SavedForm {
	form: { message: string };
}

describe('/admin/catalogue', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await createAdmin(seeded.services);
	});

	const editUrl = (id: string, action: string) => ({
		url: `/admin/catalogue/${id}?/${action}`,
		params: { id }
	});

	/** A new draft bundle through the create action; resolves to its id. */
	async function createBundle(title = 'Zippers Pack'): Promise<string> {
		const result = String(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/catalogue/new?/create',
				fields: { kind: 'bundle', title, slug: '', price: '39.50' }
			})
		);
		expect(result).toMatch(/^redirect 303 \/admin\/catalogue\/[0-9a-f-]{36}$/);
		return result.split('/').pop() ?? '';
	}

	it('lists every product with price, items count and flags', async () => {
		await db()
			.update(schema.products)
			.set({ is_published: false, sale_price: 1900 })
			.where(eq(schema.products.id, seeded.bundle.id));
		const page = (await runLoad(seeded.services, adminId, listLoad, {
			url: '/admin/catalogue'
		})) as ListData;
		const bundle = page.products.find((product) => product.id === seeded.bundle.id);
		expect(bundle).toMatchObject({
			kind: 'bundle',
			is_published: false,
			itemCount: 2,
			pricing: { listPrice: 2900, price: 1900, onSale: true }
		});
		expect(page.products.map((product) => product.kind).sort()).toEqual([
			'bundle',
			'course',
			'single'
		]);
	});

	it('creates a bundle with a slug from the title and opens its editor', async () => {
		const id = await createBundle('Zips & Buttonholes');
		const product = await seeded.services.catalog.getById(id);
		expect(product).toMatchObject({
			kind: 'bundle',
			access_scope: 'items',
			title: 'Zips & Buttonholes',
			slug: 'zips-and-buttonholes',
			price: 3950,
			is_published: false,
			items: []
		});
		expect(await auditActions(seeded.services, id)).toEqual(['product.create']);

		const page = (await runLoad(seeded.services, adminId, editLoad, {
			url: `/admin/catalogue/${id}`,
			params: { id }
		})) as EditData;
		expect(page.product.id).toBe(id);
		expect(page.lessons).toEqual([]);
		expect(page.checklist).toEqual([
			'Add a cover image',
			'Write a description',
			'Add the videos it sells (a bundle needs two or more, a single exactly one)'
		]);
	});

	it('new single from a lesson pre-fills the item and refuses a course kind', async () => {
		const page = (await runLoad(seeded.services, adminId, newLoad, {
			url: `/admin/catalogue/new?kind=single&lesson=${seeded.lessons.first}`
		})) as NewData;
		expect(page.kind).toBe('single');
		expect(page.lesson).toEqual({ id: seeded.lessons.first, title: 'first-lesson' });

		const result = String(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/catalogue/new?/create',
				fields: {
					kind: 'single',
					title: 'First lesson',
					price: '4',
					lessonId: seeded.lessons.first
				}
			})
		);
		const id = result.split('/').pop() ?? '';
		const product = await seeded.services.catalog.getById(id);
		expect(product?.items.map((item) => item.lesson_id)).toEqual([seeded.lessons.first]);

		const { status, form } = failed(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/catalogue/new?/create',
				fields: { kind: 'course', title: 'Second course', price: '10' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors.kind).toEqual(['Choose bundle or single']);
	});

	it('shows a slug collision on the slug field', async () => {
		const { status, form } = failed(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/catalogue/new?/create',
				fields: { kind: 'bundle', title: 'Basics bundle', slug: 'basics-bundle', price: '10' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors.slug).toEqual(['This slug is already in use']);
	});

	it('basics and pricing save independently, each keeping the other section', async () => {
		const id = await createBundle();
		const basics = (await submitAction(seeded.services, adminId, editActions.basics, {
			...editUrl(id, 'basics'),
			fields: {
				title: 'Zippers Pack',
				slug: 'zippers-pack',
				tagline: 'Every zip',
				descriptionMd: 'All the **zips**',
				coverImageUrl: 'https://cdn.example.com/zips.jpg'
			}
		})) as SavedForm;
		expect(basics.form.message).toBe('Basics saved.');

		const pricing = (await submitAction(seeded.services, adminId, editActions.pricing, {
			...editUrl(id, 'pricing'),
			fields: {
				price: '49',
				salePrice: '29.99',
				saleStartsAt: '2026-11-01T09:00',
				saleEndsAt: ''
			}
		})) as SavedForm;
		expect(pricing.form.message).toBe('Pricing saved.');

		expect(await seeded.services.catalog.getById(id)).toMatchObject({
			title: 'Zippers Pack',
			tagline: 'Every zip',
			description_md: 'All the **zips**',
			cover_image_url: 'https://cdn.example.com/zips.jpg',
			price: 4900,
			sale_price: 2999,
			sale_ends_at: null
		});
		const saved = await seeded.services.catalog.getById(id);
		expect(new Date(saved?.sale_starts_at ?? '').toISOString()).toBe('2026-11-01T09:00:00.000Z');
		expect(await auditActions(seeded.services, id)).toEqual([
			'product.create',
			'product.update',
			'product.update'
		]);
	});

	it('pricing refuses a sale price above the price as a field error', async () => {
		const id = await createBundle();
		const { status, form } = failed(
			await submitAction(seeded.services, adminId, editActions.pricing, {
				...editUrl(id, 'pricing'),
				fields: { price: '10', salePrice: '12' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors.salePrice).toEqual(['Sale price must be lower than the price']);
		expect((await seeded.services.catalog.getById(id))?.price).toBe(3950);
	});

	describe('contents', () => {
		it('one lesson on a bundle is a field error and nothing is saved', async () => {
			const id = await createBundle();
			const { status, form } = failed(
				await submitAction(seeded.services, adminId, editActions.contents, {
					...editUrl(id, 'contents'),
					fields: { lessonIds: JSON.stringify([seeded.lessons.first]) }
				})
			);
			expect(status).toBe(400);
			expect(form.errors.lessonIds).toEqual(['A bundle needs at least two videos']);
			expect((await seeded.services.catalog.getById(id))?.items).toEqual([]);
		});

		it('two lessons on a single is a field error', async () => {
			const { status, form } = failed(
				await submitAction(seeded.services, adminId, editActions.contents, {
					...editUrl(seeded.single.id, 'contents'),
					fields: { lessonIds: JSON.stringify([seeded.lessons.first, seeded.lessons.second]) }
				})
			);
			expect(status).toBe(400);
			expect(form.errors.lessonIds).toEqual(['A single sells exactly one video']);
		});

		it('the course has no item list', async () => {
			const { form } = failed(
				await submitAction(seeded.services, adminId, editActions.contents, {
					...editUrl(seeded.flagship.id, 'contents'),
					fields: { lessonIds: JSON.stringify([seeded.lessons.first]) }
				})
			);
			expect(form.errors.lessonIds).toEqual(['The course has no item list']);
		});

		it('a lesson id that does not exist is a field error from setItems', async () => {
			const id = await createBundle();
			const { status, form } = failed(
				await submitAction(seeded.services, adminId, editActions.contents, {
					...editUrl(id, 'contents'),
					fields: { lessonIds: JSON.stringify([seeded.lessons.first, crypto.randomUUID()]) }
				})
			);
			expect(status).toBe(404);
			expect(form.errors.lessonIds).toEqual(['Lesson not found']);
		});

		it('duplicate ids are deduped and the order kept', async () => {
			const id = await createBundle();
			const { first, second, standalone } = seeded.lessons;
			const saved = (await submitAction(seeded.services, adminId, editActions.contents, {
				...editUrl(id, 'contents'),
				fields: { lessonIds: JSON.stringify([standalone, first, standalone, second, first]) }
			})) as SavedForm;
			expect(saved.form.message).toBe('Contents saved.');
			const product = await seeded.services.catalog.getById(id);
			expect(product?.items.map((item) => item.lesson_id)).toEqual([standalone, first, second]);

			const page = (await runLoad(seeded.services, adminId, editLoad, {
				url: `/admin/catalogue/${id}`,
				params: { id }
			})) as EditData;
			expect(page.lessons.map((lesson) => lesson.id)).toEqual([standalone, first, second]);
			// “Also in”: the seeded bundle lists the course lessons.
			expect(page.lessons[1].products.map((other) => other.title).sort()).toEqual([
				'Zippers Pack',
				'basics-bundle'
			]);
		});

		it('a hidden field that is not a JSON list of ids is a field error', async () => {
			const id = await createBundle();
			const { form } = failed(
				await submitAction(seeded.services, adminId, editActions.contents, {
					...editUrl(id, 'contents'),
					fields: { lessonIds: '["not-a-uuid"' }
				})
			);
			expect(form.errors.lessonIds).toEqual(['Invalid item list']);
		});
	});

	describe('visibility', () => {
		it('publishing an incomplete product is refused with the unmet checklist items', async () => {
			const id = await createBundle();
			const { status, form } = failed(
				await submitAction(seeded.services, adminId, editActions.visibility, {
					...editUrl(id, 'visibility'),
					fields: { isPublished: 'on', isFeatured: 'on', sortOrder: '5' }
				})
			);
			expect(status).toBe(400);
			expect(form.errors._errors).toEqual([
				'Not published yet: Add a cover image; Write a description; Add the videos it sells (a bundle needs two or more, a single exactly one).'
			]);
			expect(await seeded.services.catalog.getById(id)).toMatchObject({
				is_published: false,
				is_featured: false,
				sort_order: 0
			});
			expect(await auditActions(seeded.services, id)).toEqual(['product.create']);
		});

		it('publishing a complete product publishes it and writes the audit row', async () => {
			const id = await createBundle();
			await submitAction(seeded.services, adminId, editActions.basics, {
				...editUrl(id, 'basics'),
				fields: {
					title: 'Zippers Pack',
					slug: 'zippers-pack',
					descriptionMd: 'All the zips',
					coverImageUrl: 'https://cdn.example.com/zips.jpg'
				}
			});
			await submitAction(seeded.services, adminId, editActions.contents, {
				...editUrl(id, 'contents'),
				fields: { lessonIds: JSON.stringify([seeded.lessons.first, seeded.lessons.standalone]) }
			});

			const saved = (await submitAction(seeded.services, adminId, editActions.visibility, {
				...editUrl(id, 'visibility'),
				fields: { isPublished: 'on', sortOrder: '2' }
			})) as SavedForm;
			expect(saved.form.message).toBe('Visibility saved.');
			expect(await seeded.services.catalog.getById(id)).toMatchObject({
				is_published: true,
				is_featured: false,
				sort_order: 2
			});
			const [entry] = await db()
				.select()
				.from(schema.audit_log)
				.where(eq(schema.audit_log.action, 'product.publish'));
			expect(entry).toMatchObject({
				actor_id: adminId,
				entity: 'product',
				entity_id: id,
				before: { is_published: false },
				after: { is_published: true }
			});

			// Unticking unpublishes.
			await submitAction(seeded.services, adminId, editActions.visibility, {
				...editUrl(id, 'visibility'),
				fields: { sortOrder: '2' }
			});
			expect((await seeded.services.catalog.getById(id))?.is_published).toBe(false);
		});
	});

	it('the editor shows promotions scoped to the product', async () => {
		const code = await seeded.services.commerce.promo.create({
			code: 'BUNDLE10',
			description: '',
			discountType: 'percentage',
			discountValue: 10,
			appliesTo: 'products',
			productIds: [seeded.bundle.id],
			minSubtotal: null,
			maxRedemptions: null,
			maxRedemptionsPerUser: null,
			startsAt: null,
			endsAt: null,
			isActive: true,
			stackableWithSale: false
		});
		const page = (await runLoad(seeded.services, adminId, editLoad, {
			url: `/admin/catalogue/${seeded.bundle.id}`,
			params: { id: seeded.bundle.id }
		})) as EditData;
		expect(page.promotions).toEqual([
			{
				id: code.id,
				code: 'BUNDLE10',
				discountType: 'percentage',
				discountValue: 10,
				status: 'active'
			}
		]);
		expect(page.checklist).toEqual([]);
	});

	it('delete refuses a product with history and removes a fresh draft', async () => {
		const { status, form } = failed(
			await submitAction(seeded.services, adminId, editActions.delete, {
				...editUrl(seeded.bundle.id, 'delete'),
				fields: { confirm: 'delete' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors._errors).toEqual([
			'This product has been sold or granted; unpublish it instead of deleting it'
		]);

		const id = await createBundle();
		expect(
			await submitAction(seeded.services, adminId, editActions.delete, {
				...editUrl(id, 'delete'),
				fields: { confirm: 'delete' }
			})
		).toBe('redirect 303 /admin/catalogue');
		expect(await seeded.services.catalog.getById(id)).toBeNull();
	});

	it('an unknown or malformed id is a 404', async () => {
		expect(
			await runLoad(seeded.services, adminId, editLoad, {
				url: '/admin/catalogue/nope',
				params: { id: 'nope' }
			})
		).toBe('error 404');
		const id = crypto.randomUUID();
		expect(
			await runLoad(seeded.services, adminId, editLoad, {
				url: `/admin/catalogue/${id}`,
				params: { id }
			})
		).toBe('error 404');
	});

	describe('GET /admin/api/lessons', () => {
		async function search(userId: string | null, q: string) {
			const event = await memberEvent(seeded.services, userId, {
				url: `/admin/api/lessons?q=${encodeURIComponent(q)}`
			});
			return outcome(() => searchLessons(event as unknown as SearchEvent));
		}

		it('is admin-only', async () => {
			expect(await search(null, '')).toMatch(/^redirect 303 \/auth\/sign-in\?redirectTo=/);
			expect(await search(seeded.users.member.id, '')).toBe('redirect 303 /');
			await db()
				.update(schema.profiles)
				.set({ is_suspended: true })
				.where(eq(schema.profiles.id, adminId));
			expect(await search(adminId, '')).toBe('redirect 303 /');
		});

		it('returns the lessons with module, duration and the products listing them', async () => {
			const response = (await search(adminId, 'first')) as Response;
			expect(response.status).toBe(200);
			const { lessons } = (await response.json()) as {
				lessons: Array<{ id: string; products: Array<{ id: string; title: string }> }>;
			};
			expect(lessons).toEqual([
				{
					id: seeded.lessons.first,
					title: 'first-lesson',
					moduleTitle: 'Basics',
					durationSeconds: 600,
					isPublished: true,
					products: [{ id: seeded.bundle.id, title: 'basics-bundle' }]
				}
			]);
		});

		it('returns at most 20 rows', async () => {
			for (let i = 0; i < 22; i += 1) {
				await seeded.services.content.lessons.create({
					moduleId: null,
					title: `Extra ${i}`,
					slug: `extra-${i}`,
					kind: 'article',
					mediaAssetId: null,
					description: '',
					contentMd: 'Text',
					isFreePreview: false,
					isPublished: false,
					orderIndex: i
				});
			}
			const response = (await search(adminId, '')) as Response;
			const { lessons } = (await response.json()) as { lessons: unknown[] };
			expect(lessons).toHaveLength(20);
		});
	});

	it('non-admins cannot run the editor actions', async () => {
		expect(
			await submitAction(seeded.services, seeded.users.member.id, editActions.visibility, {
				...editUrl(seeded.bundle.id, 'visibility'),
				fields: { sortOrder: '0' }
			})
		).toBe('error 403');
		expect((await seeded.services.catalog.getById(seeded.bundle.id))?.is_published).toBe(true);
	});
});
