import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { POST } from '../../src/routes/admin/api/upload/+server.ts';
import { createAdmin } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log } = schema;

type UploadEvent = Parameters<typeof POST>[0];

/** 2026-10-18T12:00:00Z: uploads land under uploads/2026/10/. */
const NOW = new Date(Date.UTC(2026, 9, 18, 12));

/** The 8-byte PNG signature followed by padding, as a File. */
function pngFile(size = 64, name = 'cover.png', type = 'image/png'): File {
	const bytes = new Uint8Array(size);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	return new File([bytes], name, { type });
}

describe('POST /admin/api/upload', () => {
	const { db } = useTestDb();
	let services: TestServices;
	let adminId: string;
	let memberId: string;

	beforeEach(async () => {
		services = createTestServices(db(), { now: () => NOW });
		adminId = await createAdmin(services);
		memberId = await services.users.createCredentialUser({
			email: 'member@example.com',
			password: FIXTURE_PASSWORD
		});
	});

	async function upload(userId: string | null, body: BodyInit, contentType?: string) {
		const event = await memberEvent(services, userId, {
			method: 'POST',
			url: '/admin/api/upload',
			headers: contentType ? { 'content-type': contentType } : undefined,
			body
		});
		return outcome(() => POST(event as unknown as UploadEvent));
	}

	function multipart(file: File | string): FormData {
		const form = new FormData();
		form.set('file', file);
		return form;
	}

	it('refuses non-admins with 403 and signed-out visitors with 401, storing nothing', async () => {
		expect(await upload(memberId, multipart(pngFile()))).toBe('error 403');
		expect(await upload(null, multipart(pngFile()))).toBe('error 401');
		expect(services.storage.files.size).toBe(0);
	});

	it('stores a PNG under uploads/yyyy/mm/<uuid>.png, answers its CDN URL and audits it', async () => {
		const response = (await upload(adminId, multipart(pngFile(64)))) as Response;
		expect(response.status).toBe(200);
		const { url } = (await response.json()) as { url: string };
		expect(url).toMatch(/^https:\/\/cdn\.example\.test\/uploads\/2026\/10\/[0-9a-f-]{36}\.png$/);

		const path = url.slice('https://cdn.example.test/'.length);
		const stored = services.storage.files.get(path);
		expect(stored?.contentType).toBe('image/png');
		expect(stored?.bytes.byteLength).toBe(64);
		expect(Array.from(stored?.bytes.slice(0, 4) ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);

		const [entry] = await db().select().from(audit_log).where(eq(audit_log.action, 'upload.put'));
		expect(entry).toMatchObject({
			actor_id: adminId,
			entity: 'upload',
			entity_id: path,
			after: { path, url, content_type: 'image/png', size: 64 }
		});
	});

	it('maps the extension from the content type, not the file name', async () => {
		const response = (await upload(
			adminId,
			multipart(pngFile(16, 'pattern.exe', 'application/pdf'))
		)) as Response;
		expect(response.status).toBe(200);
		const { url } = (await response.json()) as { url: string };
		expect(url).toMatch(/\.pdf$/);
	});

	it('rejects a disallowed type with 400 and stores nothing', async () => {
		for (const type of ['image/svg+xml', 'text/html', 'application/zip', '']) {
			const response = (await upload(adminId, multipart(pngFile(16, 'f', type)))) as Response;
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				error: 'Only JPEG, PNG, WebP, AVIF images and PDF files can be uploaded',
				code: 'UPLOAD_TYPE_NOT_ALLOWED'
			});
		}
		expect(services.storage.files.size).toBe(0);
		expect(await db().select().from(audit_log)).toEqual([]);
	});

	it('rejects a file over 25 MB with 400 before storing anything', async () => {
		const response = (await upload(adminId, multipart(pngFile(25 * 1024 * 1024 + 1)))) as Response;
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Files must be 25 MB or smaller',
			code: 'UPLOAD_TOO_LARGE'
		});
		expect(services.storage.files.size).toBe(0);
	});

	it('rejects a request without a file part or without a multipart body', async () => {
		const noFile = (await upload(adminId, multipart('not-a-file'))) as Response;
		expect(noFile.status).toBe(400);
		expect(await noFile.json()).toEqual({ error: 'Expected a multipart form with a file' });

		const json = (await upload(
			adminId,
			JSON.stringify({ file: 'x' }),
			'application/json'
		)) as Response;
		expect(json.status).toBe(400);
		expect(services.storage.files.size).toBe(0);
	});
});
