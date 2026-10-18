import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user_progress, lessons } from '$lib/server/db/schema';
import { eq, and, inArray, type SQL } from 'drizzle-orm';
import { isActiveMember } from '$lib/server/access';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Longest position accepted, in seconds (24 hours)
const MAX_POSITION_SECONDS = 86400;

export const POST: RequestHandler = async ({ request, locals }) => {
	const profile = locals.profile;

	// Must be authenticated and an active member
	if (!profile) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!profile.is_member) {
		return json({ error: 'Membership required' }, { status: 403 });
	}

	// A member who is not active is suspended
	if (!isActiveMember(profile)) {
		return json({ error: 'Account suspended' }, { status: 403 });
	}

	try {
		// Validate the body before any database call: lessonId must be a UUID,
		// completed (when present) a boolean, position (when present) an
		// integer number of seconds within a day.
		const body: unknown = await request.json();

		if (typeof body !== 'object' || body === null) {
			return json({ error: 'Invalid request' }, { status: 400 });
		}

		const { lessonId, completed = true, position } = body as Record<string, unknown>;

		if (typeof lessonId !== 'string' || !UUID_RE.test(lessonId)) {
			return json({ error: 'Invalid request' }, { status: 400 });
		}

		if (typeof completed !== 'boolean') {
			return json({ error: 'Invalid request' }, { status: 400 });
		}

		if (
			position !== undefined &&
			(typeof position !== 'number' ||
				!Number.isInteger(position) ||
				position < 0 ||
				position > MAX_POSITION_SECONDS)
		) {
			return json({ error: 'Invalid request' }, { status: 400 });
		}

		// Upsert progress
		const now = new Date().toISOString();
		const updateData: Partial<typeof user_progress.$inferInsert> = {
			completed,
			updated_at: now
		};

		if (completed) {
			updateData.completed_at = now;
		}

		if (typeof position === 'number') {
			updateData.last_position_seconds = position;
		}

		try {
			// Progress can only be recorded against a lesson that exists and is
			// published
			const [lesson] = await db
				.select({ id: lessons.id })
				.from(lessons)
				.where(and(eq(lessons.id, lessonId), eq(lessons.is_published, true)))
				.limit(1);

			if (!lesson) {
				return json({ error: 'Lesson not found' }, { status: 404 });
			}

			const rows = await db
				.insert(user_progress)
				.values({
					user_id: profile.id,
					lesson_id: lessonId,
					...updateData
				})
				.onConflictDoUpdate({
					target: [user_progress.user_id, user_progress.lesson_id],
					set: updateData
				})
				.returning();

			return json({ success: true, progress: rows[0] });
		} catch (err) {
			console.error('Failed to update progress:', err);
			return json({ error: 'Failed to update progress' }, { status: 500 });
		}
	} catch (err) {
		console.error('Progress API error:', err);
		return json({ error: 'Invalid request' }, { status: 400 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const profile = locals.profile;

	// Same checks as POST: 401 signed out, 403 non-member, 403 suspended
	if (!profile) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!profile.is_member) {
		return json({ error: 'Membership required' }, { status: 403 });
	}

	if (!isActiveMember(profile)) {
		return json({ error: 'Account suspended' }, { status: 403 });
	}

	const lessonId = url.searchParams.get('lessonId');
	const moduleId = url.searchParams.get('moduleId');

	try {
		const conditions: SQL[] = [eq(user_progress.user_id, profile.id)];

		if (lessonId) {
			conditions.push(eq(user_progress.lesson_id, lessonId));
		}

		if (moduleId) {
			// Get all (published) lessons for this module first
			const moduleLessons = await db
				.select({ id: lessons.id })
				.from(lessons)
				.where(and(eq(lessons.module_id, moduleId), eq(lessons.is_published, true)));

			if (moduleLessons.length === 0) {
				// No published lessons: no progress for this module (previously
				// the filter was silently dropped, returning ALL progress)
				return json({ progress: [] });
			}

			const lessonIds = moduleLessons.map((l) => l.id);
			conditions.push(inArray(user_progress.lesson_id, lessonIds));
		}

		const data = await db
			.select()
			.from(user_progress)
			.where(and(...conditions));

		return json({ progress: data });
	} catch (err) {
		console.error('Failed to fetch progress:', err);
		return json({ error: 'Failed to fetch progress' }, { status: 500 });
	}
};
