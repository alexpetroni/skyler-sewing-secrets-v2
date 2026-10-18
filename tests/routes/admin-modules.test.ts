import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	actions as listActions,
	load as listLoad
} from '../../src/routes/admin/content/modules/+page.server.ts';
import {
	actions as newActions,
	load as newLoad
} from '../../src/routes/admin/content/modules/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/content/modules/[id]/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListData = import('../../src/routes/admin/content/modules/$types').PageServerData;
type NewData = import('../../src/routes/admin/content/modules/new/$types').PageServerData;
type EditData = import('../../src/routes/admin/content/modules/[id]/$types').PageServerData;

const moduleFields = {
	title: 'Hems',
	slug: 'hems',
	description: 'All about hems',
	thumbnailUrl: '',
	orderIndex: '3',
	isPublished: 'on',
	isCourseContent: 'on'
};

describe('/admin/content/modules', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await createAdmin(seeded.services);
	});

	it('lists modules with lesson counts for admins only', async () => {
		const data = (await runLoad(seeded.services, adminId, listLoad, {
			url: '/admin/content/modules'
		})) as ListData;
		expect(data.modules.map((m) => [m.slug, m.lessonCount])).toEqual([['basics', 2]]);

		expect(
			await runLoad(seeded.services, seeded.users.member.id, listLoad, {
				url: '/admin/content/modules'
			})
		).toBe('redirect 303 /');
	});

	it('creates a module with an audit row and redirects to it', async () => {
		const page = (await runLoad(seeded.services, adminId, newLoad, {
			url: '/admin/content/modules/new'
		})) as NewData;
		expect(page.nextOrderIndex).toBe(1);

		const result = await submitAction(seeded.services, adminId, newActions.create, {
			url: '/admin/content/modules/new?/create',
			fields: moduleFields
		});
		const [, , location] = String(result).split(' ');
		expect(String(result)).toMatch(/^redirect 303 \/admin\/content\/modules\/[0-9a-f-]{36}$/);
		const id = location.split('/').pop() ?? '';
		const created = await seeded.services.content.modules.getById(id);
		expect(created).toMatchObject({
			title: 'Hems',
			slug: 'hems',
			order_index: 3,
			is_published: true,
			is_bonus: false,
			is_course_content: true
		});
		expect(await auditActions(seeded.services, id)).toEqual(['module.create']);
	});

	it('shows a slug collision on the slug field', async () => {
		const result = await submitAction(seeded.services, adminId, newActions.create, {
			url: '/admin/content/modules/new?/create',
			fields: { ...moduleFields, slug: 'basics' }
		});
		const { status, form } = failed(result);
		expect(status).toBe(400);
		expect(form.errors.slug).toEqual(['This slug is already in use']);
	});

	it('refuses non-admin writes with 403', async () => {
		const result = await submitAction(seeded.services, seeded.users.member.id, newActions.create, {
			url: '/admin/content/modules/new?/create',
			fields: moduleFields
		});
		expect(result).toBe('error 403');
		expect(await seeded.services.content.modules.list()).toHaveLength(1);
	});

	it('moves a module down and up', async () => {
		const second = await seeded.services.content.modules.create({
			title: 'Second',
			slug: 'second',
			description: '',
			thumbnailUrl: '',
			orderIndex: 1,
			isPublished: false,
			isBonus: false,
			isCourseContent: true
		});
		const down = (await submitAction(seeded.services, adminId, listActions.moveDown, {
			url: '/admin/content/modules?/moveDown',
			fields: { id: seeded.moduleId }
		})) as { form: { message: string } };
		expect(down.form.message).toBe('Order saved.');
		expect((await seeded.services.content.modules.list()).map((m) => m.id)).toEqual([
			second.id,
			seeded.moduleId
		]);
		expect(await auditActions(seeded.services, seeded.moduleId)).toEqual(['module.move']);

		await submitAction(seeded.services, adminId, listActions.moveUp, {
			url: '/admin/content/modules?/moveUp',
			fields: { id: seeded.moduleId }
		});
		expect((await seeded.services.content.modules.list()).map((m) => m.id)).toEqual([
			seeded.moduleId,
			second.id
		]);
	});

	it('loads, updates and 404s on the edit page', async () => {
		const data = (await runLoad(seeded.services, adminId, editLoad, {
			url: `/admin/content/modules/${seeded.moduleId}`,
			params: { id: seeded.moduleId }
		})) as EditData;
		expect(data.module.slug).toBe('basics');
		expect(data.lessons.map((lesson) => lesson.id)).toEqual([
			seeded.lessons.first,
			seeded.lessons.second
		]);

		const saved = (await submitAction(seeded.services, adminId, editActions.update, {
			url: `/admin/content/modules/${seeded.moduleId}?/update`,
			params: { id: seeded.moduleId },
			fields: { ...moduleFields, slug: 'basics', title: 'Basics, revised' }
		})) as { form: { message: string } };
		expect(saved.form.message).toBe('Module updated successfully.');
		expect((await seeded.services.content.modules.getById(seeded.moduleId))?.title).toBe(
			'Basics, revised'
		);

		expect(
			await runLoad(seeded.services, adminId, editLoad, {
				url: '/admin/content/modules/nope',
				params: { id: 'nope' }
			})
		).toBe('error 404');
	});

	it('refuses to delete a module with sold lessons, with the service message', async () => {
		const result = await submitAction(seeded.services, adminId, editActions.delete, {
			url: `/admin/content/modules/${seeded.moduleId}?/delete`,
			params: { id: seeded.moduleId },
			fields: { confirm: 'delete' }
		});
		const { status, form } = failed(result);
		expect(status).toBe(400);
		expect(form.errors._errors).toEqual([
			'A lesson of this module is part of a product; remove it from the product first'
		]);
		expect(await seeded.services.content.modules.getById(seeded.moduleId)).not.toBeNull();
	});

	it('deletes an unsold module only after the typed confirmation', async () => {
		const extra = await seeded.services.content.modules.create({
			title: 'Extra',
			slug: 'extra',
			description: '',
			thumbnailUrl: '',
			orderIndex: 1,
			isPublished: false,
			isBonus: false,
			isCourseContent: true
		});
		const unconfirmed = failed(
			await submitAction(seeded.services, adminId, editActions.delete, {
				url: `/admin/content/modules/${extra.id}?/delete`,
				params: { id: extra.id },
				fields: { confirm: 'nope' }
			})
		);
		expect(unconfirmed.form.errors.confirm).toEqual(['Type the phrase exactly to confirm']);

		const result = await submitAction(seeded.services, adminId, editActions.delete, {
			url: `/admin/content/modules/${extra.id}?/delete`,
			params: { id: extra.id },
			fields: { confirm: 'delete' }
		});
		expect(result).toBe('redirect 303 /admin/content/modules');
		expect(await seeded.services.content.modules.getById(extra.id)).toBeNull();
		expect(await auditActions(seeded.services, extra.id)).toEqual(['module.delete']);
	});
});
