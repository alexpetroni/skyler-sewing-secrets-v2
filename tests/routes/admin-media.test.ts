import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { signedUploadTicket, TUS_ENDPOINT } from '../../src/lib/server/platform/bunny.ts';
import { createFakeVideoHost } from '../../src/lib/server/platform/fakes/video-host.ts';
import { GET as mediaStatus } from '../../src/routes/admin/api/media/[id]/+server.ts';
import { POST as ticketEndpoint } from '../../src/routes/admin/api/upload-ticket/+server.ts';
import { POST as reissueEndpoint } from '../../src/routes/admin/api/upload-ticket/reissue/+server.ts';
import {
	actions as listActions,
	load as listLoad
} from '../../src/routes/admin/media/+page.server.ts';
import {
	actions as detailActions,
	load as detailLoad
} from '../../src/routes/admin/media/[id]/+page.server.ts';
import {
	actions as importActions,
	load as importLoad
} from '../../src/routes/admin/media/import/+page.server.ts';
import { load as uploadLoad } from '../../src/routes/admin/media/upload/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, lessons, media_assets } = schema;

type ListData = import('../../src/routes/admin/media/$types').PageServerData;
type ImportData = import('../../src/routes/admin/media/import/$types').PageServerData;
type DetailData = import('../../src/routes/admin/media/[id]/$types').PageServerData;
type TicketEvent = Parameters<typeof ticketEndpoint>[0];
type ReissueEvent = Parameters<typeof reissueEndpoint>[0];
type StatusEvent = Parameters<typeof mediaStatus>[0];

/** 2026-10-18T12:00:00Z: tickets expire two hours later. */
const NOW = Date.UTC(2026, 9, 18, 12);
const EXPIRES = Math.floor(NOW / 1000) + 7200;

interface TicketBody {
	assetId: string;
	endpoint: string;
	headers: Record<string, string>;
	metadata?: Record<string, string>;
}

describe('/admin/media and the upload endpoints', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;
	let memberId: string;

	beforeEach(async () => {
		services = createTestServices(db(), { videoHost: createFakeVideoHost({ now: () => NOW }) });
		adminId = await createAdmin(services);
		memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD
		});
	});

	async function postJson<E>(
		handler: (event: E) => Response | Promise<Response>,
		userId: string | null,
		url: string,
		body: unknown
	) {
		const event = await memberEvent(services, userId, {
			method: 'POST',
			url,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		return outcome(() => handler(event as unknown as E));
	}

	const requestTicket = (userId: string | null, body: unknown) =>
		postJson<TicketEvent>(ticketEndpoint, userId, '/admin/api/upload-ticket', body);
	const reissue = (userId: string | null, body: unknown) =>
		postJson<ReissueEvent>(reissueEndpoint, userId, '/admin/api/upload-ticket/reissue', body);

	async function status(userId: string | null, id: string) {
		const event = await memberEvent(services, userId, {
			url: `/admin/api/media/${id}`,
			params: { id }
		});
		return outcome(() => mediaStatus(event as unknown as StatusEvent));
	}

	describe('POST /admin/api/upload-ticket', () => {
		it('refuses non-admins with 403 and signed-out visitors with 401, creating nothing', async () => {
			expect(await requestTicket(memberId, { title: 'Collars' })).toBe('error 403');
			expect(await requestTicket(null, { title: 'Collars' })).toBe('error 401');
			expect(await db().select().from(media_assets)).toEqual([]);
			expect(services.videoHost.videos.size).toBe(0);
		});

		it('creates an uploading asset and returns the fake host’s presigned ticket headers only', async () => {
			const response = (await requestTicket(adminId, {
				title: 'Collars',
				filetype: 'video/quicktime'
			})) as Response;
			expect(response.status).toBe(200);
			const raw = await response.text();
			const body = JSON.parse(raw) as TicketBody;

			const [asset] = await db().select().from(media_assets);
			expect(asset).toMatchObject({
				id: body.assetId,
				title: 'Collars',
				status: 'uploading',
				library_id: '100'
			});
			const expected = await signedUploadTicket('100', 'fake-api-key', asset.video_id, EXPIRES);
			expect(body).toEqual({
				assetId: asset.id,
				endpoint: TUS_ENDPOINT,
				headers: expected.headers,
				metadata: { title: 'Collars', filetype: 'video/quicktime' }
			});
			expect(body.headers).toEqual({
				AuthorizationSignature: expected.headers.AuthorizationSignature,
				AuthorizationExpire: String(EXPIRES),
				VideoId: asset.video_id,
				LibraryId: '100'
			});
			// The key itself never leaves the server.
			expect(raw).not.toContain('fake-api-key');
			expect(await auditActions(services, asset.id)).toEqual(['media.upload']);
		});

		it('rejects a missing title and a non-video file type with 400', async () => {
			const noTitle = (await requestTicket(adminId, { title: '  ' })) as Response;
			expect(noTitle.status).toBe(400);
			expect(await noTitle.json()).toEqual({ error: 'Title is required' });
			const notVideo = (await requestTicket(adminId, {
				title: 'Notes',
				filetype: 'application/pdf'
			})) as Response;
			expect(notVideo.status).toBe(400);
			expect(await db().select().from(media_assets)).toEqual([]);
		});
	});

	describe('POST /admin/api/upload-ticket/reissue', () => {
		it('signs a fresh ticket for the same video, 404 for an unknown asset, 403 for members', async () => {
			const { asset } = await services.media.createUpload({ title: 'Long upload' });

			const response = (await reissue(adminId, { assetId: asset.id })) as Response;
			expect(response.status).toBe(200);
			const body = (await response.json()) as TicketBody;
			const expected = await signedUploadTicket('100', 'fake-api-key', asset.video_id, EXPIRES);
			expect(body).toEqual({
				assetId: asset.id,
				endpoint: TUS_ENDPOINT,
				headers: expected.headers
			});
			expect(await db().select().from(media_assets)).toHaveLength(1);

			const unknown = (await reissue(adminId, { assetId: crypto.randomUUID() })) as Response;
			expect(unknown.status).toBe(404);
			const invalid = (await reissue(adminId, { assetId: 'nope' })) as Response;
			expect(invalid.status).toBe(400);
			expect(await reissue(memberId, { assetId: asset.id })).toBe('error 403');
		});
	});

	describe('GET /admin/api/media/[id]', () => {
		it('reports the stored status until the encode is ready', async () => {
			const { asset } = await services.media.createUpload({ title: 'Polling' });
			const before = (await status(adminId, asset.id)) as Response;
			expect(await before.json()).toEqual({
				id: asset.id,
				title: 'Polling',
				status: 'uploading',
				durationSeconds: null,
				thumbnailUrl: null
			});

			services.videoHost.finishEncoding(asset.video_id, { lengthSeconds: 845 });
			await services.media.handleWebhook({ videoGuid: asset.video_id });
			const after = (await status(adminId, asset.id)) as Response;
			expect(await after.json()).toMatchObject({ status: 'ready', durationSeconds: 845 });

			expect(((await status(adminId, crypto.randomUUID())) as Response).status).toBe(404);
			expect(((await status(adminId, 'nope')) as Response).status).toBe(404);
			expect(await status(memberId, asset.id)).toBe('redirect 303 /');
		});
	});

	it('the upload page is admin-only', async () => {
		expect(await runLoad(services, adminId, uploadLoad, { url: '/admin/media/upload' })).toEqual(
			{}
		);
		expect(await runLoad(services, memberId, uploadLoad, { url: '/admin/media/upload' })).toBe(
			'redirect 303 /'
		);
	});

	it('lists assets with search and status filters, and syncs every pending asset now', async () => {
		const pending = await services.media.createUpload({ title: 'Zip pending' });
		await services.media.createUpload({ title: 'Hems pending' });

		const searched = (await runLoad(services, adminId, listLoad, {
			url: '/admin/media?q=zip'
		})) as ListData;
		expect(searched.assets.map((asset) => asset.title)).toEqual(['Zip pending']);
		expect(searched.query).toEqual({ q: 'zip', status: undefined });

		services.videoHost.finishEncoding(pending.asset.video_id);
		const synced = (await submitAction(services, adminId, listActions.sync, {
			url: '/admin/media?/sync'
		})) as { form: { message: string } };
		expect(synced.form.message).toBe('Synced 2 videos.');

		const ready = (await runLoad(services, adminId, listLoad, {
			url: '/admin/media?status=ready'
		})) as ListData;
		expect(ready.assets.map((asset) => asset.id)).toEqual([pending.asset.id]);
		const [audit] = await db().select().from(audit_log).where(eq(audit_log.action, 'media.sync'));
		expect(audit).toMatchObject({ actor_id: adminId, after: { synced: 2, failed: 0 } });

		expect(
			await submitAction(services, memberId, listActions.sync, { url: '/admin/media?/sync' })
		).toBe('error 403');
	});

	it('browses the Bunny library and imports one video or the whole page', async () => {
		const first = await services.videoHost.createVideo('Bunny first');
		await services.videoHost.createVideo('Bunny second');

		const page = (await runLoad(services, adminId, importLoad, {
			url: '/admin/media/import'
		})) as ImportData;
		expect(page.library.items.map((video) => [video.title, video.assetId])).toEqual([
			['Bunny second', null],
			['Bunny first', null]
		]);
		expect(page.library).toMatchObject({ page: 1, pageCount: 1, total: 2 });
		expect(await db().select().from(media_assets)).toEqual([]);

		const one = (await submitAction(services, adminId, importActions.importVideo, {
			url: '/admin/media/import?/importVideo',
			fields: { videoId: first.videoId }
		})) as { form: { message: string } };
		expect(one.form.message).toBe('Video imported.');
		expect((await db().select().from(media_assets)).map((asset) => asset.video_id)).toEqual([
			first.videoId
		]);

		const gone = failed(
			await submitAction(services, adminId, importActions.importVideo, {
				url: '/admin/media/import?/importVideo',
				fields: { videoId: 'deleted-in-bunny' }
			})
		);
		expect(gone.status).toBe(404);
		expect(gone.form.errors._errors).toEqual(['This video is no longer in the Bunny library']);

		const all = (await submitAction(services, adminId, importActions.importPage, {
			url: '/admin/media/import?page=1&/importPage'
		})) as { form: { message: string } };
		expect(all.form.message).toBe('Imported 2 videos.');
		expect(await db().select().from(media_assets)).toHaveLength(2);
	});

	it('sets the thumbnail time and refuses to delete a video a lesson plays', async () => {
		const { asset } = await services.media.createUpload({ title: 'Used' });
		const [lesson] = await db()
			.insert(lessons)
			.values({ title: 'Standalone', slug: 'standalone', media_asset_id: asset.id })
			.returning();
		const target = { url: `/admin/media/${asset.id}`, params: { id: asset.id } };

		const data = (await runLoad(services, adminId, detailLoad, target)) as DetailData;
		expect(data.asset).toMatchObject({ id: asset.id, linkedLessonId: lesson.id });

		const thumb = (await submitAction(services, adminId, detailActions.thumbnail, {
			url: `/admin/media/${asset.id}?/thumbnail`,
			params: target.params,
			fields: { seconds: '42' }
		})) as { form: { message: string } };
		expect(thumb.form.message).toBe('Thumbnail requested; Bunny updates it in a few seconds.');
		expect(services.videoHost.thumbnailTimes.get(asset.video_id)).toBe(42);

		const refused = failed(
			await submitAction(services, adminId, detailActions.delete, {
				url: `/admin/media/${asset.id}?/delete`,
				params: target.params,
				fields: { confirm: 'delete' }
			})
		);
		expect(refused.status).toBe(400);
		expect(refused.form.errors._errors).toEqual([
			'This video is used by a lesson; unlink it first'
		]);
		expect(services.videoHost.videos.has(asset.video_id)).toBe(true);

		await db().delete(lessons).where(eq(lessons.id, lesson.id));
		const deleted = await submitAction(services, adminId, detailActions.delete, {
			url: `/admin/media/${asset.id}?/delete`,
			params: target.params,
			fields: { confirm: 'delete' }
		});
		expect(deleted).toBe('redirect 303 /admin/media');
		expect(services.videoHost.videos.has(asset.video_id)).toBe(false);
		// Created by the test without an actor; only the admin's two actions are audited.
		expect(await auditActions(services, asset.id)).toEqual(['media.set_thumbnail', 'media.delete']);

		expect(
			await runLoad(services, adminId, detailLoad, {
				url: '/admin/media/nope',
				params: { id: 'nope' }
			})
		).toBe('error 404');
	});
});
