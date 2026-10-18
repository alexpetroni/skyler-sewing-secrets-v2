import { and, eq, inArray } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { createHandle } from '../../src/lib/server/http/create-handle.ts';
import { isMaintenanceExempt } from '../../src/lib/server/http/maintenance.ts';
import { load as homeLoad } from '../../src/routes/(marketing)/+page.server.ts';
import { actions, load } from '../../src/routes/admin/settings/+page.server.ts';
import { createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent, runHandle } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { createTestServices, TEST_CONTACT_EMAIL, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type Data = import('../../src/routes/admin/settings/$types').PageServerData;
type HomeData = import('../../src/routes/(marketing)/$types').PageServerData;
type HomeLoadEvent = Parameters<typeof homeLoad>[0];

const { audit_log, lessons, site_settings } = schema;

describe('/admin/settings', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let services: TestServices;
	let adminId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		services = seeded.services;
		adminId = await createAdmin(services);
	});

	const settings = async () =>
		(await runLoad(services, adminId, load, { url: '/admin/settings' })) as Data;

	const submit = (action: keyof typeof actions, fields: Record<string, string> = {}) =>
		submitAction(services, adminId, actions[action], { url: `/admin/settings?/${action}`, fields });

	/** A visitor's request to `/` through the given hook pipeline; the response status. */
	async function visitHome(handle: Handle): Promise<number> {
		const response = await runHandle(handle, fakeEvent({ url: '/' }), async () => {
			return new Response('page', { status: 200 });
		});
		return response.status;
	}

	async function settingAudits(key: string) {
		return db()
			.select({ actor: audit_log.actor_id, before: audit_log.before, after: audit_log.after })
			.from(audit_log)
			.where(and(eq(audit_log.action, 'setting.update'), eq(audit_log.entity_id, key)))
			.orderBy(audit_log.created_at);
	}

	it('shows the maintenance flag and the contact email from config, for admins only', async () => {
		const data = await settings();
		expect(data.maintenanceMode).toBe(false);
		expect(data.contactEmail).toBe(TEST_CONTACT_EMAIL);
		expect(await runLoad(services, seeded.users.member.id, load, { url: '/admin/settings' })).toBe(
			'redirect 303 /'
		);
		expect(
			await submitAction(services, seeded.users.member.id, actions.maintenanceOn, {
				url: '/admin/settings?/maintenanceOn',
				fields: { confirm: 'maintenance on' }
			})
		).toBe('error 403');
	});

	it('turns maintenance on only with the typed phrase, and audits each toggle', async () => {
		const refused = failed(await submit('maintenanceOn', { confirm: 'yes' }));
		expect(refused.status).toBe(400);
		expect(refused.form.errors.confirm).toEqual(['Type the phrase exactly to confirm']);
		expect(await services.marketing.settings.get('maintenance_mode')).toBeNull();

		const on = (await submit('maintenanceOn', { confirm: 'Maintenance On' })) as {
			form: { message: string };
		};
		expect(on.form.message).toBe('Maintenance mode is on.');
		expect((await settings()).maintenanceMode).toBe(true);

		await submit('maintenanceOff');
		expect((await settings()).maintenanceMode).toBe(false);

		expect(await settingAudits('maintenance_mode')).toEqual([
			{ actor: adminId, before: null, after: { value: 'true' } },
			{ actor: adminId, before: { value: 'true' }, after: { value: 'false' } }
		]);
	});

	it('the hook on the same instance sees the toggle at once (cache invalidated)', async () => {
		const handle = createHandle({ getServices: async () => services, isMaintenanceExempt });
		// Reads and caches `false`.
		expect(await visitHome(handle)).toBe(200);

		await submit('maintenanceOn', { confirm: 'maintenance on' });
		expect(await visitHome(handle)).toBe(503);

		await submit('maintenanceOff');
		expect(await visitHome(handle)).toBe(200);
	});

	it('another instance sees the toggle once its 30 second cache window has passed', async () => {
		let clock = new Date('2026-04-01T10:00:00.000Z');
		const other = createTestServices(db(), { now: () => clock });
		const otherHandle = createHandle({ getServices: async () => other, isMaintenanceExempt });
		expect(await visitHome(otherHandle)).toBe(200);

		await submit('maintenanceOn', { confirm: 'maintenance on' });
		clock = new Date('2026-04-01T10:00:29.000Z');
		expect(await visitHome(otherHandle)).toBe(200);

		clock = new Date('2026-04-01T10:00:30.000Z');
		expect(await visitHome(otherHandle)).toBe(503);
	});

	it('the preview lesson setting changes freePreviewLesson(), with a fallback', async () => {
		const { first, second, standalone } = seeded.lessons;
		await db()
			.update(lessons)
			.set({ is_free_preview: true })
			.where(inArray(lessons.id, [first, standalone]));
		const preview = async () => (await services.content.freePreviewLesson())?.lesson.id;

		// No setting: the first flagged lesson in course order.
		expect(await preview()).toBe(first);
		const page = await settings();
		expect(page.previewLessonId).toBe('');
		expect(page.previewLessons.map((lesson) => lesson.id).sort()).toEqual(
			[first, standalone].sort()
		);
		expect(page.currentPreview?.id).toBe(first);

		const saved = (await submit('preview', { lessonId: standalone })) as {
			form: { message: string };
		};
		expect(saved.form.message).toBe('Homepage preview saved.');
		expect(await preview()).toBe(standalone);
		expect((await settings()).previewLessonId).toBe(standalone);
		const home = (await homeLoad(
			fakeEvent({ url: '/', locals: { services } }) as unknown as HomeLoadEvent
		)) as HomeData;
		expect(home.maintenance === false && home.freePreview?.title).toBe('standalone-video');

		// An unpublished choice falls back.
		await db().update(lessons).set({ is_published: false }).where(eq(lessons.id, standalone));
		expect(await preview()).toBe(first);

		// So does a lesson that is not a free preview: the homepage plays it to everyone.
		await submit('preview', { lessonId: second });
		expect(await preview()).toBe(first);

		await submit('preview', { lessonId: '' });
		const [row] = await db()
			.select({ value: site_settings.value })
			.from(site_settings)
			.where(eq(site_settings.key, 'home_preview_lesson_id'));
		expect(row.value).toBe('');
		expect(await preview()).toBe(first);
		expect((await settingAudits('home_preview_lesson_id')).map((audit) => audit.after)).toEqual([
			{ value: standalone },
			{ value: second },
			{ value: '' }
		]);

		const invalid = failed(await submit('preview', { lessonId: 'not-a-lesson' }));
		expect(invalid.form.errors.lessonId).toEqual(['Choose a lesson']);
	});
});
