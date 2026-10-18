import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { GET, POST } from '../../src/routes/api/progress/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { lessons, profiles, user_progress } = schema;

type PostEvent = Parameters<typeof POST>[0];
type GetEvent = Parameters<typeof GET>[0];

describe('/api/progress', () => {
	const { db } = useTestDb();

	async function post(seeded: SeededCatalog, userId: string | null, body: unknown) {
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: '/api/progress',
			headers: { 'content-type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		});
		return POST(event as unknown as PostEvent);
	}

	async function get(seeded: SeededCatalog, userId: string | null, query = '') {
		const event = await memberEvent(seeded.services, userId, { url: `/api/progress${query}` });
		return GET(event as unknown as GetEvent);
	}

	const progressRows = (userId: string) =>
		db().select().from(user_progress).where(eq(user_progress.user_id, userId));

	it('answers 401 to anonymous visitors on POST and GET', async () => {
		const seeded = await seedCatalog(db());

		const posted = await post(seeded, null, { lessonId: seeded.lessons.first, completed: true });
		expect(posted.status).toBe(401);
		expect(await posted.json()).toEqual({ error: 'Unauthorized' });
		expect((await get(seeded, null)).status).toBe(401);
		expect(await db().select().from(user_progress)).toEqual([]);
	});

	it('answers 403 for a lesson the user cannot access and for a suspended account', async () => {
		const seeded = await seedCatalog(db());
		const { bundleOwner, member } = seeded.users;

		const outside = await post(seeded, bundleOwner.id, {
			lessonId: seeded.lessons.standalone,
			positionSeconds: 30
		});
		expect(outside.status).toBe(403);
		expect(await progressRows(bundleOwner.id)).toEqual([]);

		await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, member.id));
		const suspended = await post(seeded, member.id, {
			lessonId: seeded.lessons.first,
			completed: true
		});
		expect(suspended.status).toBe(403);
		expect(await suspended.json()).toEqual({ error: 'Account suspended' });
		expect((await get(seeded, member.id)).status).toBe(403);
		expect(await progressRows(member.id)).toEqual([]);
	});

	it('answers 400 to a malformed body and 404 to an unpublished lesson', async () => {
		const seeded = await seedCatalog(db());
		const { member } = seeded.users;
		const lessonId = seeded.lessons.first;

		const bad: unknown[] = [
			'not json',
			null,
			{},
			{ lessonId: 'not-a-uuid' },
			{ lessonId, completed: 'yes' },
			{ lessonId, positionSeconds: -1 },
			{ lessonId, positionSeconds: 12.5 },
			{ lessonId, positionSeconds: 86_401 }
		];
		for (const body of bad) {
			const response = await post(seeded, member.id, body === null ? 'null' : body);
			expect(response.status, JSON.stringify(body)).toBe(400);
		}

		await db().update(lessons).set({ is_published: false }).where(eq(lessons.id, lessonId));
		expect((await post(seeded, member.id, { lessonId, completed: true })).status).toBe(404);
		expect(await progressRows(member.id)).toEqual([]);
	});

	it('upserts progress for an owner, and for anyone signed in on a free preview', async () => {
		const seeded = await seedCatalog(db());
		const { bundleOwner, nobody } = seeded.users;
		const lessonId = seeded.lessons.first;

		const first = await post(seeded, bundleOwner.id, { lessonId, positionSeconds: 95 });
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({
			success: true,
			progress: { lesson_id: lessonId, last_position_seconds: 95, completed: false }
		});
		const second = await post(seeded, bundleOwner.id, { lessonId, completed: true });
		expect(second.status).toBe(200);
		expect(await progressRows(bundleOwner.id)).toMatchObject([
			{ lesson_id: lessonId, last_position_seconds: 95, completed: true }
		]);

		expect((await post(seeded, nobody.id, { lessonId, positionSeconds: 10 })).status).toBe(403);
		await db().update(lessons).set({ is_free_preview: true }).where(eq(lessons.id, lessonId));
		expect((await post(seeded, nobody.id, { lessonId, positionSeconds: 10 })).status).toBe(200);
		expect(await progressRows(nobody.id)).toMatchObject([
			{ lesson_id: lessonId, last_position_seconds: 10 }
		]);
	});

	it("GET returns the user's own progress, filtered by lesson or module, and validates ids", async () => {
		const seeded = await seedCatalog(db());
		const { member, bundleOwner } = seeded.users;
		const { content } = seeded.services;
		for (const lessonId of [seeded.lessons.first, seeded.lessons.standalone]) {
			await content.progress.upsert({ userId: member.id, lessonId, completed: true });
		}
		await content.progress.upsert({
			userId: bundleOwner.id,
			lessonId: seeded.lessons.second,
			positionSeconds: 5
		});

		const lessonIds = async (query: string) => {
			const response = await get(seeded, member.id, query);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { progress: Array<{ lesson_id: string }> };
			return body.progress.map((row) => row.lesson_id).sort();
		};

		expect(await lessonIds('')).toEqual([seeded.lessons.first, seeded.lessons.standalone].sort());
		expect(await lessonIds(`?lessonId=${seeded.lessons.standalone}`)).toEqual([
			seeded.lessons.standalone
		]);
		expect(await lessonIds(`?moduleId=${seeded.moduleId}`)).toEqual([seeded.lessons.first]);

		expect((await get(seeded, member.id, '?lessonId=nope')).status).toBe(400);
		expect((await get(seeded, member.id, '?moduleId=1234')).status).toBe(400);
	});
});
