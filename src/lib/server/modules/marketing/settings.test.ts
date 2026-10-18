import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createTestServices, type TestServices } from '../../../../../tests/helpers/services.ts';
import { schema } from '#lib/server/db/index.ts';
import { MAINTENANCE_CACHE_MS } from './settings.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, site_settings } = schema;

describe('marketing settings', () => {
	const { db } = useTestDb();
	let clock: Date;
	let services: TestServices;
	let adminId: string;

	beforeEach(async () => {
		clock = new Date('2026-10-01T09:00:00.000Z');
		// The production seed row, removed by the per-test truncation.
		await db().insert(site_settings).values({ key: 'maintenance_mode', value: 'false' });
		services = createTestServices(db(), { now: () => clock });
		adminId = await services.users.createCredentialUser({
			email: 'admin@example.com',
			password: 'a-good-password'
		});
	});

	const advance = (ms: number) => {
		clock = new Date(clock.getTime() + ms);
	};

	/** Writes the flag behind the service's back, as another instance would. */
	async function writeFlag(value: string): Promise<void> {
		await db()
			.update(site_settings)
			.set({ value })
			.where(eq(site_settings.key, 'maintenance_mode'));
	}

	it('get returns the stored value or null; set upserts and audits in one go', async () => {
		const { settings } = services.marketing;
		expect(await settings.get('maintenance_mode')).toBe('false');
		expect(await settings.get('home_preview_lesson_id')).toBeNull();

		await settings.set('home_preview_lesson_id', 'lesson-1', adminId);
		await settings.set('maintenance_mode', 'true', adminId);

		expect(await settings.get('home_preview_lesson_id')).toBe('lesson-1');
		expect(await settings.get('maintenance_mode')).toBe('true');
		const audits = await db()
			.select({
				actor: audit_log.actor_id,
				action: audit_log.action,
				entity: audit_log.entity,
				entityId: audit_log.entity_id,
				before: audit_log.before,
				after: audit_log.after
			})
			.from(audit_log)
			.orderBy(audit_log.created_at);
		expect(audits).toEqual([
			{
				actor: adminId,
				action: 'setting.update',
				entity: 'site_setting',
				entityId: 'home_preview_lesson_id',
				before: null,
				after: { value: 'lesson-1' }
			},
			{
				actor: adminId,
				action: 'setting.update',
				entity: 'site_setting',
				entityId: 'maintenance_mode',
				before: { value: 'false' },
				after: { value: 'true' }
			}
		]);
	});

	it('writes neither the setting nor the audit entry when the audit insert fails', async () => {
		const { settings } = services.marketing;
		const missingActor = '00000000-0000-4000-8000-000000000000';

		await expect(settings.set('maintenance_mode', 'true', missingActor)).rejects.toThrow();

		expect(await settings.get('maintenance_mode')).toBe('false');
		expect(await db().select().from(audit_log)).toEqual([]);
	});

	it('caches the maintenance flag for 30 seconds', async () => {
		const { settings } = services.marketing;
		expect(MAINTENANCE_CACHE_MS).toBe(30_000);
		expect(await settings.isMaintenanceMode()).toBe(false);

		await writeFlag('true');
		advance(MAINTENANCE_CACHE_MS - 1);
		expect(await settings.isMaintenanceMode()).toBe(false);

		advance(1);
		expect(await settings.isMaintenanceMode()).toBe(true);
	});

	it('drops the cache when this instance sets the flag', async () => {
		const { settings } = services.marketing;
		expect(await settings.isMaintenanceMode()).toBe(false);

		await settings.set('maintenance_mode', 'true', adminId);

		expect(await settings.isMaintenanceMode()).toBe(true);
	});

	it('fails open and logs when the settings table cannot be read', async () => {
		await db().execute('DROP TABLE site_settings');

		expect(await services.marketing.settings.isMaintenanceMode()).toBe(false);
		expect(services.logEntries.find((entry) => entry.level === 'error')?.message).toBe(
			'failed to read maintenance_mode'
		);
	});
});
