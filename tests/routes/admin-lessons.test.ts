import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { POST as preview } from '../../src/routes/admin/api/markdown-preview/+server.ts';
import { load as listLoad } from '../../src/routes/admin/content/lessons/+page.server.ts';
import {
	actions as newActions,
	load as newLoad
} from '../../src/routes/admin/content/lessons/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/content/lessons/[id]/+page.server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { media_assets } = schema;

type ListData = import('../../src/routes/admin/content/lessons/$types').PageServerData;
type NewData = import('../../src/routes/admin/content/lessons/new/$types').PageServerData;
type EditData = import('../../src/routes/admin/content/lessons/[id]/$types').PageServerData;
type PreviewEvent = Parameters<typeof preview>[0];

const lessonFields = {
	moduleId: '',
	title: 'Bias binding',
	slug: 'bias-binding',
	kind: 'video',
	mediaAssetId: '',
	description: 'Binding curved edges',
	contentMd: 'Cut on the **bias**.',
	orderIndex: '0'
};

describe('/admin/content/lessons', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;
	let processingAssetId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await createAdmin(seeded.services);
		const [asset] = await db()
			.insert(media_assets)
			.values({ library_id: '100', video_id: 'still-encoding', title: 'Raw', status: 'processing' })
			.returning();
		processingAssetId = asset.id;
	});

	const editUrl = (id: string, action: string) => ({
		url: `/admin/content/lessons/${id}?/${action}`,
		params: { id }
	});

	it('creates a standalone lesson and redirects to its editor', async () => {
		const page = (await runLoad(seeded.services, adminId, newLoad, {
			url: '/admin/content/lessons/new'
		})) as NewData;
		expect(page.moduleId).toBeNull();
		expect(page.assets.map((asset) => asset.id)).toContain(processingAssetId);

		const result = String(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/content/lessons/new?/create',
				fields: lessonFields
			})
		);
		expect(result).toMatch(/^redirect 303 \/admin\/content\/lessons\/[0-9a-f-]{36}$/);
		const id = result.split('/').pop() ?? '';
		const lesson = await seeded.services.content.lessons.getById(id);
		expect(lesson).toMatchObject({
			module_id: null,
			title: 'Bias binding',
			slug: 'bias-binding',
			kind: 'video',
			media_asset_id: null,
			is_published: false,
			is_free_preview: false,
			content_md: 'Cut on the **bias**.'
		});
		expect(lesson?.content_html).toContain('<strong>bias</strong>');
		expect(await auditActions(seeded.services, id)).toEqual(['lesson.create']);
	});

	it('starts a new lesson in the module given in the query', async () => {
		const page = (await runLoad(seeded.services, adminId, newLoad, {
			url: `/admin/content/lessons/new?module=${seeded.moduleId}`
		})) as NewData;
		expect(page.moduleId).toBe(seeded.moduleId);
		expect(page.modules).toEqual([{ id: seeded.moduleId, title: 'Basics' }]);
	});

	it('shows a slug collision on the slug field', async () => {
		const { status, form } = failed(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/content/lessons/new?/create',
				fields: { ...lessonFields, slug: 'standalone-video' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors.slug).toEqual(['This slug is already used by another standalone video']);
		expect(form.errors._errors).toBeUndefined();
	});

	it('refuses to publish with media that is not ready, as a form error', async () => {
		const { status, form } = failed(
			await submitAction(seeded.services, adminId, editActions.update, {
				...editUrl(seeded.lessons.standalone, 'update'),
				fields: {
					...lessonFields,
					slug: 'standalone-video',
					mediaAssetId: processingAssetId,
					isPublished: 'on'
				}
			})
		);
		expect(status).toBe(400);
		expect(form.errors._errors).toEqual([
			'Attach a video that has finished processing before publishing'
		]);
		const lesson = await seeded.services.content.lessons.getById(seeded.lessons.standalone);
		expect(lesson?.media_asset_id).not.toBe(processingAssetId);
		expect(await auditActions(seeded.services, seeded.lessons.standalone)).toEqual([]);

		// The same edit saved as a draft goes through.
		const saved = (await submitAction(seeded.services, adminId, editActions.update, {
			...editUrl(seeded.lessons.standalone, 'update'),
			fields: { ...lessonFields, slug: 'standalone-video', mediaAssetId: processingAssetId }
		})) as { form: { message: string } };
		expect(saved.form.message).toBe('Lesson saved.');
		expect(await seeded.services.content.lessons.getById(seeded.lessons.standalone)).toMatchObject({
			media_asset_id: processingAssetId,
			is_published: false
		});
		expect(await auditActions(seeded.services, seeded.lessons.standalone)).toEqual([
			'lesson.update'
		]);
	});

	it('refuses to delete a lesson that is in a product, with the service message', async () => {
		const { status, form } = failed(
			await submitAction(seeded.services, adminId, editActions.delete, {
				...editUrl(seeded.lessons.first, 'delete'),
				fields: { confirm: 'delete' }
			})
		);
		expect(status).toBe(400);
		expect(form.errors._errors).toEqual([
			'This lesson is part of a product; remove it from the product first'
		]);
		expect(await seeded.services.content.lessons.getById(seeded.lessons.first)).not.toBeNull();
	});

	it('deletes an unsold lesson after the typed confirmation', async () => {
		const draft = await seeded.services.content.lessons.create({
			...lessonFields,
			moduleId: null,
			kind: 'article',
			mediaAssetId: null,
			isFreePreview: false,
			isPublished: false,
			orderIndex: 0
		});
		const result = await submitAction(seeded.services, adminId, editActions.delete, {
			...editUrl(draft.id, 'delete'),
			fields: { confirm: 'delete' }
		});
		expect(result).toBe('redirect 303 /admin/content/lessons');
		expect(await seeded.services.content.lessons.getById(draft.id)).toBeNull();
	});

	it('adds and removes https resources, refusing other URLs on the field', async () => {
		const id = seeded.lessons.first;
		const refused = failed(
			await submitAction(seeded.services, adminId, editActions.addResource, {
				...editUrl(id, 'addResource'),
				fields: { title: 'Pattern', fileUrl: 'http://cdn.example.com/pattern.pdf' }
			})
		);
		expect(refused.form.errors.fileUrl).toEqual(['Must be an https:// URL']);

		const added = (await submitAction(seeded.services, adminId, editActions.addResource, {
			...editUrl(id, 'addResource'),
			fields: { title: 'Pattern', fileUrl: 'https://cdn.example.com/pattern.pdf' }
		})) as { form: { message: string } };
		expect(added.form.message).toBe('Resource added.');

		const data = (await runLoad(seeded.services, adminId, editLoad, {
			url: `/admin/content/lessons/${id}`,
			params: { id }
		})) as EditData;
		expect(data.lesson.id).toBe(id);
		expect(data.resources.map((r) => [r.title, r.file_url])).toEqual([
			['Pattern', 'https://cdn.example.com/pattern.pdf']
		]);
		const resourceId = data.resources[0].id;
		expect(await auditActions(seeded.services, resourceId)).toEqual(['lesson_resource.create']);

		await submitAction(seeded.services, adminId, editActions.removeResource, {
			...editUrl(id, 'removeResource'),
			fields: { resourceId }
		});
		expect(await seeded.services.content.resources.listForLesson(id)).toEqual([]);
	});

	it('filters the list by module, standalone, unpublished and media not ready', async () => {
		await seeded.services.content.lessons.create({
			...lessonFields,
			kind: 'video',
			moduleId: seeded.moduleId,
			mediaAssetId: processingAssetId,
			isFreePreview: false,
			isPublished: false,
			orderIndex: 5
		});
		const ids = async (query: string) =>
			(
				(await runLoad(seeded.services, adminId, listLoad, {
					url: `/admin/content/lessons${query}`
				})) as ListData
			).lessons.map((row) => row.lesson.slug);

		expect(await ids('')).toEqual([
			'first-lesson',
			'second-lesson',
			'bias-binding',
			'standalone-video'
		]);
		expect(await ids(`?module=${seeded.moduleId}`)).toEqual([
			'first-lesson',
			'second-lesson',
			'bias-binding'
		]);
		expect(await ids('?filter=standalone')).toEqual(['standalone-video']);
		expect(await ids('?filter=unpublished')).toEqual(['bias-binding']);
		expect(await ids('?filter=media-not-ready')).toEqual(['bias-binding']);
		expect(await ids('?filter=bogus')).toHaveLength(4);
		expect(
			await runLoad(seeded.services, seeded.users.member.id, listLoad, {
				url: '/admin/content/lessons'
			})
		).toBe('redirect 303 /');
	});

	it('refuses lesson writes from a non-admin with 403', async () => {
		const result = await submitAction(seeded.services, seeded.users.member.id, editActions.update, {
			...editUrl(seeded.lessons.first, 'update'),
			fields: lessonFields
		});
		expect(result).toBe('error 403');
	});

	describe('POST /admin/api/markdown-preview', () => {
		async function render(userId: string | null, markdown: string) {
			const event = await memberEvent(seeded.services, userId, {
				method: 'POST',
				url: '/admin/api/markdown-preview',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ markdown })
			});
			return outcome(() => preview(event as unknown as PreviewEvent));
		}

		it('returns sanitised HTML: scripts and event handlers are stripped', async () => {
			const response = (await render(
				adminId,
				'## Title\n\n<script>alert(1)</script>\n\n<img src="https://x.test/a.png" onerror="alert(2)">'
			)) as Response;
			expect(response.status).toBe(200);
			const { html } = (await response.json()) as { html: string };
			expect(html).toContain('<h2>Title</h2>');
			expect(html).not.toContain('<script');
			expect(html).not.toContain('alert(1)');
			expect(html).not.toContain('onerror');
		});

		it('is admin-only: 403 for a member, 401 when signed out', async () => {
			expect(await render(seeded.users.member.id, '# Hi')).toBe('error 403');
			expect(await render(null, '# Hi')).toBe('error 401');
		});

		it('rejects a body without markdown with 400', async () => {
			const event = await memberEvent(seeded.services, adminId, {
				method: 'POST',
				url: '/admin/api/markdown-preview',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ body: 42 })
			});
			const response = await preview(event as unknown as PreviewEvent);
			expect(response.status).toBe(400);
		});
	});

	it('suspended admins are refused', async () => {
		await db()
			.update(schema.profiles)
			.set({ is_suspended: true })
			.where(eq(schema.profiles.id, adminId));
		expect(
			await submitAction(seeded.services, adminId, newActions.create, {
				url: '/admin/content/lessons/new?/create',
				fields: lessonFields
			})
		).toBe('error 403');
	});
});
