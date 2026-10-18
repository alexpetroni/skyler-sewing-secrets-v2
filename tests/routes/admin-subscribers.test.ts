import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { load as listLoad } from '../../src/routes/admin/inbox/subscribers/+page.server.ts';
import { GET as exportCsv } from '../../src/routes/admin/inbox/subscribers/export.csv/+server.ts';
import { createAdmin, runLoad } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ListData = import('../../src/routes/admin/inbox/subscribers/$types').PageServerData;

describe('/admin/inbox/subscribers', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;

	beforeEach(async () => {
		services = createTestServices(db());
		adminId = await createAdmin(services);
		await db()
			.insert(schema.newsletter_subscribers)
			.values([
				{
					email: 'confirmed@example.com',
					is_active: true,
					confirmed_at: '2026-01-02T10:00:00Z',
					subscribed_at: '2026-01-01T10:00:00Z'
				},
				{
					// A pending double opt-in.
					email: 'pending@example.com',
					is_active: false,
					confirm_token_hash: 'a'.repeat(64),
					subscribed_at: '2026-01-03T10:00:00Z'
				},
				{
					// Legacy single opt-in: active, never confirmed.
					email: '=legacy"quote@example.com',
					is_active: true,
					subscribed_at: '2026-01-04T10:00:00Z'
				},
				{
					email: 'left@example.com',
					is_active: false,
					confirmed_at: '2026-01-02T10:00:00Z',
					unsubscribed_at: '2026-01-06T10:00:00Z',
					subscribed_at: '2026-01-05T10:00:00Z'
				}
			]);
	});

	const list = async (query = '') =>
		(await runLoad(services, adminId, listLoad, {
			url: `/admin/inbox/subscribers${query}`
		})) as ListData;

	it('lists subscribers newest first with their status and filters by status', async () => {
		const all = await list();
		expect(all.status).toBeNull();
		expect(all.subscribers.map((row) => [row.email, row.status])).toEqual([
			['left@example.com', 'unsubscribed'],
			['=legacy"quote@example.com', 'unconfirmed'],
			['pending@example.com', 'unconfirmed'],
			['confirmed@example.com', 'confirmed']
		]);
		expect(all.counts).toEqual({ total: 4, confirmed: 1, unconfirmed: 2, unsubscribed: 1 });

		expect((await list('?status=confirmed')).subscribers.map((row) => row.email)).toEqual([
			'confirmed@example.com'
		]);
		expect((await list('?status=unconfirmed')).subscribers.map((row) => row.email)).toEqual([
			'=legacy"quote@example.com',
			'pending@example.com'
		]);
		const unsubscribed = await list('?status=unsubscribed');
		expect(unsubscribed.status).toBe('unsubscribed');
		expect(unsubscribed.subscribers.map((row) => row.email)).toEqual(['left@example.com']);
		// Counts do not depend on the filter; an unknown filter shows everything.
		expect(unsubscribed.counts.total).toBe(4);
		expect((await list('?status=bogus')).subscribers).toHaveLength(4);
	});

	it('exports every subscriber as a quoted, formula-safe CSV attachment', async () => {
		const response = (await runLoad(services, adminId, exportCsv, {
			url: '/admin/inbox/subscribers/export.csv'
		})) as Response;
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(response.headers.get('content-disposition')).toBe(
			'attachment; filename="newsletter-subscribers.csv"'
		);
		expect(response.headers.get('cache-control')).toBe('no-store');

		const lines = (await response.text()).trimEnd().split('\r\n');
		expect(lines[0]).toBe('"email","is_active","confirmed_at","subscribed_at","unsubscribed_at"');
		expect(lines).toHaveLength(5);
		// Every cell quoted, inner quotes doubled, the leading `=` neutralised.
		const legacy = lines.find((line) => line.includes('legacy'));
		expect(legacy).toMatch(/^"'=legacy""quote@example\.com","true","","2026-01-04 [^"]+",""$/);
		for (const line of lines) expect(line).toMatch(/^"[^,]*"(,"[^,]*")*$/);
	});

	it('is for active admins only', async () => {
		const memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD
		});
		expect(
			await runLoad(services, memberId, exportCsv, { url: '/admin/inbox/subscribers/export.csv' })
		).toBe('redirect 303 /');
		expect(
			await runLoad(services, null, exportCsv, { url: '/admin/inbox/subscribers/export.csv' })
		).toMatch(/^redirect 303 \/auth\/sign-in/);
		expect(await runLoad(services, memberId, listLoad, { url: '/admin/inbox/subscribers' })).toBe(
			'redirect 303 /'
		);
	});
});
