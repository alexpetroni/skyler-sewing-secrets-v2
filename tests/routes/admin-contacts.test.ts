import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from '../../src/routes/admin/inbox/contacts/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type Data = import('../../src/routes/admin/inbox/contacts/$types').PageServerData;

describe('/admin/inbox/contacts', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;

	beforeEach(async () => {
		services = createTestServices(db());
		adminId = await createAdmin(services);
	});

	it('lists messages and marks one read with an audit row', async () => {
		const { id } = await services.marketing.contact.submit({
			name: 'Sam',
			email: 'sam@example.com',
			subject: 'Hemming',
			message: 'How do I hem jersey?'
		});
		const data = (await runLoad(services, adminId, load, { url: '/admin/inbox/contacts' })) as Data;
		expect(data.contacts.map((c) => [c.id, c.email, c.is_read])).toEqual([
			[id, 'sam@example.com', false]
		]);

		const result = (await submitAction(services, adminId, actions.markRead, {
			url: '/admin/inbox/contacts?/markRead',
			fields: { id }
		})) as { form: { message: string } };
		expect(result.form.message).toBe('Marked as read.');
		expect((await services.marketing.contact.list())[0].is_read).toBe(true);
		expect(await auditActions(services, id)).toEqual(['contact_submission.mark_read']);
	});

	it('404s on an unknown message and refuses non-admins', async () => {
		const missing = failed(
			await submitAction(services, adminId, actions.markRead, {
				url: '/admin/inbox/contacts?/markRead',
				fields: { id: '00000000-0000-4000-8000-000000000000' }
			})
		);
		expect(missing.status).toBe(404);

		const memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD
		});
		expect(await runLoad(services, memberId, load, { url: '/admin/inbox/contacts' })).toBe(
			'redirect 303 /'
		);
	});
});
