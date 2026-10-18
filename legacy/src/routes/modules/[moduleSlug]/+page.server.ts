import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { modules, lessons, user_progress } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { isActiveMember } from '$lib/server/access';

export const load: PageServerLoad = async ({ params, locals }) => {
	const profile = locals.profile;

	// Get published module with its published lessons
	let module:
		| (Pick<
				typeof modules.$inferSelect,
				'id' | 'title' | 'slug' | 'description' | 'thumbnail_url' | 'order_index' | 'is_bonus'
		  > & {
				lessons: Pick<
					typeof lessons.$inferSelect,
					| 'id'
					| 'title'
					| 'slug'
					| 'description'
					| 'duration_minutes'
					| 'is_free_preview'
					| 'is_published'
					| 'order_index'
				>[];
		  })
		| null = null;

	try {
		const moduleRow = await db.query.modules.findFirst({
			columns: {
				id: true,
				title: true,
				slug: true,
				description: true,
				thumbnail_url: true,
				order_index: true,
				is_bonus: true
			},
			with: {
				lessons: {
					columns: {
						id: true,
						title: true,
						slug: true,
						description: true,
						duration_minutes: true,
						is_free_preview: true,
						is_published: true,
						order_index: true
					},
					where: eq(lessons.is_published, true)
				}
			},
			where: and(eq(modules.slug, params.moduleSlug), eq(modules.is_published, true))
		});

		module = moduleRow ?? null;
	} catch (err) {
		console.error('Failed to load module:', err);
	}

	if (!module) {
		throw error(404, 'Module not found');
	}

	// Get user progress if member
	let progressMap: Record<string, boolean> = {};

	if (profile && isActiveMember(profile)) {
		const lessonIds = module.lessons?.map((l) => l.id) || [];

		if (lessonIds.length > 0) {
			try {
				const progress = await db
					.select({ lesson_id: user_progress.lesson_id, completed: user_progress.completed })
					.from(user_progress)
					.where(
						and(
							eq(user_progress.user_id, profile.id),
							inArray(user_progress.lesson_id, lessonIds),
							eq(user_progress.completed, true)
						)
					);

				progressMap = Object.fromEntries(progress.map((p) => [p.lesson_id, p.completed]));
			} catch (err) {
				console.error('Failed to load progress:', err);
			}
		}
	}

	// Filter and sort lessons, attach progress
	const lessonsWithProgress = (module.lessons || [])
		.filter((l) => l.is_published)
		.sort((a, b) => a.order_index - b.order_index)
		.map((lesson) => ({
			...lesson,
			progress: progressMap[lesson.id] ? { completed: true } : null
		}));

	return {
		module: {
			...module,
			lessons: lessonsWithProgress
		},
		profile
	};
};
