import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import {
	actions as listActions,
	load as listLoad
} from '../../src/routes/admin/content/faq/+page.server.ts';
import {
	actions as newActions,
	load as newLoad
} from '../../src/routes/admin/content/faq/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/content/faq/[id]/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListData = import('../../src/routes/admin/content/faq/$types').PageServerData;
type NewData = import('../../src/routes/admin/content/faq/new/$types').PageServerData;
type EditData = import('../../src/routes/admin/content/faq/[id]/$types').PageServerData;

describe('/admin/content/faq', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;

	beforeEach(async () => {
		services = createTestServices(db());
		adminId = await createAdmin(services);
	});

	async function createFaq(fields: Record<string, string>): Promise<string> {
		const result = String(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/faq/new?/create',
				fields: { orderIndex: '0', isPublished: 'on', ...fields }
			})
		);
		expect(result).toMatch(/^redirect 303 \/admin\/content\/faq\/[0-9a-f-]{36}$/);
		return result.split('/').pop() ?? '';
	}

	async function getFaq(id: string) {
		const [row] = await db().select().from(schema.faq_items).where(eq(schema.faq_items.id, id));
		return row;
	}

	it('creates a question with a sanitised answer and an audit row', async () => {
		const id = await createFaq({
			question: 'Do I need a serger?',
			answerMd: 'No. A *regular* machine works.<img src=x onerror="alert(1)"><script>x()</script>',
			category: 'Equipment'
		});
		const faq = await getFaq(id);
		expect(faq.answer_html).toContain('<em>regular</em>');
		expect(faq.answer_html).not.toMatch(/<script|onerror|x\(\)/);
		// The legacy app reads `answer`; it gets the same sanitised HTML.
		expect(faq.answer).toBe(faq.answer_html);
		expect(faq).toMatchObject({ category: 'Equipment', is_published: true, order_index: 0 });
		expect(await auditActions(services, id)).toEqual(['faq_item.create']);

		const next = (await runLoad(services, adminId, newLoad, {
			url: '/admin/content/faq/new'
		})) as NewData;
		expect(next.nextOrderIndex).toBe(1);
	});

	it('requires a question and an answer', async () => {
		const { status, form } = failed(
			await submitAction(services, adminId, newActions.create, {
				url: '/admin/content/faq/new?/create',
				fields: { question: ' ', answerMd: '', orderIndex: '0' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors.question).toEqual(['Question is required']);
		expect(form.errors.answerMd).toEqual(['Answer is required']);
	});

	it('updates an answer, re-sanitising it, and shows the item on the edit page', async () => {
		const id = await createFaq({ question: 'Q', answerMd: 'Old' });
		const saved = (await submitAction(services, adminId, editActions.update, {
			url: `/admin/content/faq/${id}?/update`,
			params: { id },
			fields: {
				question: 'Q?',
				answerMd: '[Shop](javascript:alert(1)) and [site](https://example.com)',
				category: '',
				orderIndex: '4'
			}
		})) as { form: { message: string } };
		expect(saved.form.message).toBe('FAQ updated successfully.');
		const faq = await getFaq(id);
		expect(faq.answer_html).not.toContain('javascript:');
		expect(faq.answer_html).toContain('href="https://example.com"');
		expect(faq).toMatchObject({
			question: 'Q?',
			category: null,
			order_index: 4,
			is_published: false
		});
		expect(await auditActions(services, id)).toEqual(['faq_item.create', 'faq_item.update']);

		const edit = (await runLoad(services, adminId, editLoad, {
			url: `/admin/content/faq/${id}`,
			params: { id }
		})) as EditData;
		expect(edit.faq.id).toBe(id);
	});

	it('reorders within a category and leaves other categories alone', async () => {
		const a = await createFaq({
			question: 'A',
			answerMd: 'a',
			category: 'Course',
			orderIndex: '0'
		});
		const b = await createFaq({
			question: 'B',
			answerMd: 'b',
			category: 'Course',
			orderIndex: '1'
		});
		const c = await createFaq({
			question: 'C',
			answerMd: 'c',
			category: 'Course',
			orderIndex: '2'
		});
		const other = await createFaq({
			question: 'Other',
			answerMd: 'o',
			category: 'Payments',
			orderIndex: '0'
		});
		const order = async () =>
			((await runLoad(services, adminId, listLoad, { url: '/admin/content/faq' })) as ListData).faqs
				.filter((faq) => faq.category === 'Course')
				.map((faq) => faq.id);

		const moved = (await submitAction(services, adminId, listActions.moveDown, {
			url: '/admin/content/faq?/moveDown',
			fields: { id: a }
		})) as { form: { message: string } };
		expect(moved.form.message).toBe('Order saved.');
		expect(await order()).toEqual([b, a, c]);

		await submitAction(services, adminId, listActions.moveUp, {
			url: '/admin/content/faq?/moveUp',
			fields: { id: c }
		});
		expect(await order()).toEqual([b, c, a]);
		expect((await getFaq(a)).order_index).toBe(2);

		// At the top of its category: a no-op, nothing audited.
		await submitAction(services, adminId, listActions.moveUp, {
			url: '/admin/content/faq?/moveUp',
			fields: { id: other }
		});
		expect((await getFaq(other)).order_index).toBe(0);
		expect(await auditActions(services, other)).toEqual(['faq_item.create']);
		expect(await auditActions(services, a)).toEqual(['faq_item.create', 'faq_item.move']);
	});

	it('deletes with the typed phrase and refuses non-admins', async () => {
		const id = await createFaq({ question: 'Gone?', answerMd: 'Soon' });
		const memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD
		});
		expect(
			await submitAction(services, memberId, editActions.delete, {
				url: `/admin/content/faq/${id}?/delete`,
				params: { id },
				fields: { confirm: 'delete' }
			})
		).toBe('error 403');
		expect(await runLoad(services, memberId, listLoad, { url: '/admin/content/faq' })).toBe(
			'redirect 303 /'
		);

		expect(
			await submitAction(services, adminId, editActions.delete, {
				url: `/admin/content/faq/${id}?/delete`,
				params: { id },
				fields: { confirm: 'delete' }
			})
		).toBe('redirect 303 /admin/content/faq');
		expect(await getFaq(id)).toBeUndefined();
		expect(await auditActions(services, id)).toEqual(['faq_item.create', 'faq_item.delete']);
	});
});
