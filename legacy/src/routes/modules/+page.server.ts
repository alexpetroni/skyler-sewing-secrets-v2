import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { modules, lessons, user_progress } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { isActiveMember } from '$lib/server/access';

export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;

	// Get all published modules with their published lessons
	let moduleRows: Array<
		Pick<
			typeof modules.$inferSelect,
			| 'id'
			| 'title'
			| 'slug'
			| 'description'
			| 'thumbnail_url'
			| 'order_index'
			| 'is_published'
			| 'is_bonus'
		> & {
			lessons: Pick<
				typeof lessons.$inferSelect,
				| 'id'
				| 'title'
				| 'slug'
				| 'duration_minutes'
				| 'is_free_preview'
				| 'is_published'
				| 'order_index'
			>[];
		}
	> = [];

	try {
		moduleRows = await db.query.modules.findMany({
			columns: {
				id: true,
				title: true,
				slug: true,
				description: true,
				thumbnail_url: true,
				order_index: true,
				is_published: true,
				is_bonus: true
			},
			with: {
				lessons: {
					columns: {
						id: true,
						title: true,
						slug: true,
						duration_minutes: true,
						is_free_preview: true,
						is_published: true,
						order_index: true
					},
					where: eq(lessons.is_published, true)
				}
			},
			where: eq(modules.is_published, true),
			orderBy: asc(modules.order_index)
		});
	} catch (err) {
		console.error('Failed to load modules:', err);
	}

	// If user is a member, get their progress
	let progressMap: Record<string, boolean> = {};

	if (profile && isActiveMember(profile)) {
		try {
			const progress = await db
				.select({ lesson_id: user_progress.lesson_id, completed: user_progress.completed })
				.from(user_progress)
				.where(and(eq(user_progress.user_id, profile.id), eq(user_progress.completed, true)));

			progressMap = Object.fromEntries(progress.map((p) => [p.lesson_id, p.completed]));
		} catch (err) {
			console.error('Failed to load progress:', err);
		}
	}

	// Attach progress to lessons and sort them
	const modulesWithProgress = moduleRows.map((module) => ({
		...module,
		lessons: (module.lessons || [])
			.filter((l) => l.is_published)
			.sort((a, b) => a.order_index - b.order_index)
			.map((lesson) => ({
				...lesson,
				progress: progressMap[lesson.id] ? { completed: true } : null
			}))
	}));

	return {
		modules: modulesWithProgress,
		profile
	};
};
