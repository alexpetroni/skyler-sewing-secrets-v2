import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { modules as modulesTable, user_progress } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.profile;

	// Must be logged in and a member
	if (!profile) {
		throw redirect(303, '/auth/sign-in?redirectTo=/dashboard');
	}

	if (!profile.is_member) {
		throw redirect(303, '/checkout?redirectTo=/dashboard');
	}

	// Get all modules with lessons
	const modules = await db.query.modules.findMany({
		columns: {
			id: true,
			title: true,
			slug: true,
			thumbnail_url: true,
			order_index: true,
			is_published: true
		},
		where: eq(modulesTable.is_published, true),
		orderBy: asc(modulesTable.order_index),
		with: {
			lessons: {
				columns: {
					id: true,
					title: true,
					slug: true,
					description: true,
					duration_minutes: true,
					order_index: true,
					is_published: true
				}
			}
		}
	});

	// Get user progress
	const allProgress = await db
		.select({
			lesson_id: user_progress.lesson_id,
			completed: user_progress.completed,
			completed_at: user_progress.completed_at,
			last_position_seconds: user_progress.last_position_seconds
		})
		.from(user_progress)
		.where(eq(user_progress.user_id, profile.id));

	const progressMap = new Map(
		(allProgress || []).map(p => [p.lesson_id, p])
	);

	// Calculate stats
	let totalLessons = 0;
	let completedLessons = 0;
	let totalMinutesWatched = 0;
	const completedModules: string[] = [];

	type ProgressItem = {
		lesson_id: string;
		completed: boolean;
		completed_at: string | null;
		last_position_seconds: number | null;
	};

	const allLessons: Array<{
		lesson: {
			id: string;
			title: string;
			slug: string;
			description: string | null;
			duration_minutes: number | null;
			order_index: number;
		};
		module: {
			id: string;
			title: string;
			slug: string;
			thumbnail_url: string | null;
			order_index: number;
		};
		progress: ProgressItem | null;
	}> = [];

	for (const module of modules || []) {
		const lessons = (module.lessons || [])
			.filter(l => l.is_published)
			.sort((a, b) => a.order_index - b.order_index);
		
		let moduleCompleted = lessons.length > 0;
		
		for (const lesson of lessons) {
			totalLessons++;
			const progress = progressMap.get(lesson.id);
			
			allLessons.push({
				lesson: {
					id: lesson.id,
					title: lesson.title,
					slug: lesson.slug,
					description: lesson.description,
					duration_minutes: lesson.duration_minutes,
					order_index: lesson.order_index
				},
				module: {
					id: module.id,
					title: module.title,
					slug: module.slug,
					thumbnail_url: module.thumbnail_url,
					order_index: module.order_index
				},
				progress: progress || null
			});

			if (progress?.completed) {
				completedLessons++;
				if (lesson.duration_minutes) {
					totalMinutesWatched += lesson.duration_minutes;
				}
			} else {
				moduleCompleted = false;
			}
		}

		if (moduleCompleted && lessons.length > 0) {
			completedModules.push(module.id);
		}
	}

	// Find lessons to continue watching (not completed, in order)
	const continueWatching = allLessons
		.filter(item => !item.progress?.completed)
		.sort((a, b) => {
			// Sort by module order, then lesson order
			if (a.module.order_index !== b.module.order_index) {
				return a.module.order_index - b.module.order_index;
			}
			return a.lesson.order_index - b.lesson.order_index;
		})
		.slice(0, 3);

	// Find recently completed lessons
	const recentlyCompleted = allLessons
		.filter(item => item.progress?.completed && item.progress.completed_at)
		.sort((a, b) => {
			const dateA = new Date(a.progress!.completed_at!).getTime();
			const dateB = new Date(b.progress!.completed_at!).getTime();
			return dateB - dateA;
		})
		.slice(0, 5)
		.map(item => ({
			lesson: item.lesson,
			module: item.module,
			completedAt: item.progress?.completed_at
		}));

	// Build modules list with progress
	const modulesWithProgress = (modules || []).map(module => {
		const lessons = (module.lessons || [])
			.filter(l => l.is_published)
			.sort((a, b) => a.order_index - b.order_index);

		const lessonCount = lessons.length;
		const completedCount = lessons.filter(l => progressMap.get(l.id)?.completed).length;

		return {
			id: module.id,
			title: module.title,
			slug: module.slug,
			thumbnail_url: module.thumbnail_url,
			order_index: module.order_index,
			lessonCount,
			completedCount,
			progress: lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0
		};
	});

	return {
		user: profile,
		stats: {
			totalLessons,
			completedLessons,
			totalModules: (modules || []).length,
			completedModules: completedModules.length,
			totalMinutesWatched
		},
		modules: modulesWithProgress,
		continueWatching,
		recentlyCompleted
	};
};
