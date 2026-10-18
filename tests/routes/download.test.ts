import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { GET } from '../../src/routes/(member)/download/[resourceId]/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { lessons, profiles } = schema;

type DownloadEvent = Parameters<typeof GET>[0];

const FILE_URL = 'https://files.example.com/pattern.pdf';

describe('/download/[resourceId]', () => {
	const { db } = useTestDb();

	async function download(seeded: SeededCatalog, userId: string | null, resourceId: string) {
		const event = await memberEvent(seeded.services, userId, {
			url: `/download/${resourceId}`,
			params: { resourceId }
		});
		return outcome(() => GET(event as unknown as DownloadEvent));
	}

	async function seedResource() {
		const seeded = await seedCatalog(db());
		const resource = await seeded.services.content.resources.add({
			lessonId: seeded.lessons.first,
			title: 'Pattern',
			fileUrl: FILE_URL
		});
		return { seeded, resourceId: resource.id };
	}

	it('redirects owners and the all-access member to the file', async () => {
		const { seeded, resourceId } = await seedResource();
		expect(await download(seeded, seeded.users.bundleOwner.id, resourceId)).toBe(
			`redirect 302 ${FILE_URL}`
		);
		expect(await download(seeded, seeded.users.member.id, resourceId)).toBe(
			`redirect 302 ${FILE_URL}`
		);
	});

	it('refuses non-owners, also on a free preview, and suspended accounts', async () => {
		const { seeded, resourceId } = await seedResource();
		const { nobody, member } = seeded.users;
		expect(await download(seeded, nobody.id, resourceId)).toBe('error 403');

		await db()
			.update(lessons)
			.set({ is_free_preview: true })
			.where(eq(lessons.id, seeded.lessons.first));
		expect(await download(seeded, nobody.id, resourceId)).toBe('error 403');

		await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, member.id));
		expect(await download(seeded, member.id, resourceId)).toBe('error 403');
	});

	it('sends anonymous visitors to sign-in and 404s bad or unknown ids', async () => {
		const { seeded, resourceId } = await seedResource();
		expect(await download(seeded, null, resourceId)).toBe(
			`redirect 303 /auth/sign-in?redirectTo=${encodeURIComponent(`/download/${resourceId}`)}`
		);
		const member = seeded.users.member.id;
		expect(await download(seeded, member, 'not-a-uuid')).toBe('error 404');
		expect(await download(seeded, member, crypto.randomUUID())).toBe('error 404');

		await db()
			.update(lessons)
			.set({ is_published: false })
			.where(eq(lessons.id, seeded.lessons.first));
		expect(await download(seeded, member, resourceId)).toBe('error 404');
	});
});
