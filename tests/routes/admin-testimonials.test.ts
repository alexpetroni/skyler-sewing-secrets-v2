import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import {
	actions as listActions,
	load as listLoad
} from '../../src/routes/admin/content/testimonials/+page.server.ts';
import { actions as newActions } from '../../src/routes/admin/content/testimonials/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/content/testimonials/[id]/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListData = import('../../src/routes/admin/content/testimonials/$types').PageServerData;
type EditData = import('../../src/routes/admin/content/testimonials/[id]/$types').PageServerData;

const fields = {
	authorName: 'Jo',
	authorTitle: 'Quilter',
	content: 'The best course I have taken.',
	rating: '5',
	country: 'UK',
	orderIndex: '0'
};

describe('/admin/content/testimonials', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;
	let memberId: string;

	beforeEach(async () => {
		services = createTestServices(db());
		adminId = await createAdmin(services);
		memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD,
			fullName: 'Mel Member'
		});
	});

	async function create(overrides: Record<string, string> = {}): Promise<string> {
		const result = String(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/testimonials/new?/create',
				fields: { ...fields, ...overrides }
			})
		);
		expect(result).toMatch(/^redirect 303 \/admin\/content\/testimonials\/[0-9a-f-]{36}$/);
		return result.split('/').pop() ?? '';
	}

	async function getRow(id: string) {
		const [row] = await db()
			.select()
			.from(schema.testimonials)
			.where(eq(schema.testimonials.id, id));
		return row;
	}

	const list = async () =>
		(await runLoad(services, adminId, listLoad, {
			url: '/admin/content/testimonials'
		})) as ListData;

	const row = (action: keyof typeof listActions, id: string) =>
		submitAction(services, adminId, listActions[action], {
			url: `/admin/content/testimonials?/${action}`,
			fields: { id }
		}) as Promise<{ form: { message: string } }>;

	it('creates an admin testimonial unpublished, with an audit row', async () => {
		const id = await create();
		expect(await getRow(id)).toMatchObject({
			author_name: 'Jo',
			rating: 5,
			is_published: false,
			is_featured: false,
			user_id: null
		});
		expect(await auditActions(services, id)).toEqual(['testimonial.create']);

		const invalid = failed(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/testimonials/new?/create',
				fields: { ...fields, authorName: '', rating: '9' }
			})
		);
		expect(invalid.form.errors.authorName).toEqual(['Author name is required']);
		expect(invalid.form.errors.rating).toEqual(['Choose a rating from 1 to 5']);
	});

	it('publishes and features from the list, auditing each flag', async () => {
		const id = await create();

		expect((await row('publish', id)).form.message).toBe('Testimonial published.');
		expect((await row('feature', id)).form.message).toBe('Testimonial featured.');
		expect(await getRow(id)).toMatchObject({ is_published: true, is_featured: true });
		expect((await services.marketing.testimonials.featured(6)).map((t) => t.id)).toEqual([id]);

		await row('unfeature', id);
		expect(await getRow(id)).toMatchObject({ is_published: true, is_featured: false });
		await row('unpublish', id);
		expect(await getRow(id)).toMatchObject({ is_published: false, is_featured: false });

		expect(await auditActions(services, id)).toEqual([
			'testimonial.create',
			'testimonial.publish',
			'testimonial.feature',
			'testimonial.unfeature',
			'testimonial.unpublish'
		]);
		const [audit] = await db()
			.select()
			.from(schema.audit_log)
			.where(eq(schema.audit_log.action, 'testimonial.feature'));
		expect(audit).toMatchObject({
			actor_id: adminId,
			before: { is_featured: false },
			after: { is_featured: true }
		});
	});

	it('lists pending first and shows the member who submitted a review', async () => {
		const adminAdded = await create();
		await row('publish', adminAdded);
		const submitted = await services.marketing.testimonials.submit({
			userId: memberId,
			content: 'I finally understand bias binding, thank you!',
			rating: 4,
			authorTitle: ''
		});

		const data = await list();
		expect(data.testimonials.map((t) => [t.id, t.is_published])).toEqual([
			[submitted.id, false],
			[adminAdded, true]
		]);
		expect(data.testimonials[0].user_id).toBe(memberId);
		expect(data.testimonials[0].member).toEqual({
			id: memberId,
			email: 'member@example.com',
			fullName: 'Mel Member'
		});
		expect(data.testimonials[1].member).toBeNull();

		const edit = (await runLoad(services, adminId, editLoad, {
			url: `/admin/content/testimonials/${submitted.id}`,
			params: { id: submitted.id }
		})) as EditData;
		expect(edit.testimonial.member?.id).toBe(memberId);
	});

	it('orders published testimonials and refuses to order a pending one', async () => {
		const first = await create({ authorName: 'First', orderIndex: '0' });
		const second = await create({ authorName: 'Second', orderIndex: '1' });
		const pending = await create({ authorName: 'Pending' });
		await row('publish', first);
		await row('publish', second);

		expect((await row('moveDown', first)).form.message).toBe('Order saved.');
		expect((await services.marketing.testimonials.listPublished()).map((t) => t.id)).toEqual([
			second,
			first
		]);
		expect(await auditActions(services, first)).toContain('testimonial.move');

		const refused = failed(await row('moveUp', pending));
		expect(refused.status).toBe(400);
		expect(refused.form.errors._errors).toEqual([
			'Publish the testimonial before changing its position'
		]);
	});

	it('edits and deletes, and refuses non-admins', async () => {
		const id = await create();
		const saved = (await submitAction(services, adminId, editActions.update, {
			url: `/admin/content/testimonials/${id}?/update`,
			params: { id },
			fields: { ...fields, content: 'Edited words', rating: '3', isFeatured: 'on' }
		})) as { form: { message: string } };
		expect(saved.form.message).toBe('Testimonial updated successfully.');
		expect(await getRow(id)).toMatchObject({
			content: 'Edited words',
			rating: 3,
			is_featured: true
		});

		expect(
			await submitAction(services, memberId, listActions.publish, {
				url: '/admin/content/testimonials?/publish',
				fields: { id }
			})
		).toBe('error 403');
		expect((await getRow(id)).is_published).toBe(false);

		expect(
			await submitAction(services, adminId, editActions.delete, {
				url: `/admin/content/testimonials/${id}?/delete`,
				params: { id },
				fields: { confirm: 'delete' }
			})
		).toBe('redirect 303 /admin/content/testimonials');
		expect(await getRow(id)).toBeUndefined();
		expect(await auditActions(services, id)).toEqual([
			'testimonial.create',
			'testimonial.update',
			'testimonial.delete'
		]);
	});
});
