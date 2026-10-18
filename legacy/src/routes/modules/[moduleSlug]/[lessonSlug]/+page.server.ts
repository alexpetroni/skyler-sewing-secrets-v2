import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { modules, lessons, lesson_resources, user_progress } from '$lib/server/db/schema';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { isActiveMember, SUSPENDED_MESSAGE } from '$lib/server/access';
import { getBunnyEmbedUrl } from '$lib/server/bunny';

type ModuleData = Pick<
	typeof modules.$inferSelect,
	'id' | 'title' | 'slug' | 'is_published' | 'order_index' | 'is_bonus'
>;

type LessonRow = Pick<
	typeof lessons.$inferSelect,
	| 'id'
	| 'title'
	| 'slug'
	| 'description'
	| 'content'
	| 'video_url'
	| 'duration_minutes'
	| 'is_free_preview'
	| 'is_published'
	| 'order_index'
> & {
	resources: Pick<
		typeof lesson_resources.$inferSelect,
		'id' | 'lesson_id' | 'title' | 'file_url' | 'file_type' | 'file_size_bytes'
	>[];
};

export const load: PageServerLoad = async ({ params, locals }) => {
	const profile = locals.profile;

	// Get the published module for this lesson
	let moduleData: ModuleData | null = null;

	try {
		const moduleRows = await db
			.select({
				id: modules.id,
				title: modules.title,
				slug: modules.slug,
				is_published: modules.is_published,
				order_index: modules.order_index,
				is_bonus: modules.is_bonus
			})
			.from(modules)
			.where(and(eq(modules.slug, params.moduleSlug), eq(modules.is_published, true)))
			.limit(1);

		moduleData = moduleRows[0] ?? null;
	} catch (err) {
		console.error('Failed to load module:', err);
	}

	if (!moduleData) {
		throw error(404, 'Lesson not found');
	}

	// Get the published lesson with its resources
	let lesson: LessonRow | null = null;

	try {
		const lessonRow = await db.query.lessons.findFirst({
			columns: {
				id: true,
				title: true,
				slug: true,
				description: true,
				content: true,
				video_url: true,
				duration_minutes: true,
				is_free_preview: true,
				is_published: true,
				order_index: true
			},
			with: {
				resources: {
					columns: {
						id: true,
						lesson_id: true,
						title: true,
						file_url: true,
						file_type: true,
						file_size_bytes: true
					}
				}
			},
			where: and(
				eq(lessons.module_id, moduleData.id),
				eq(lessons.slug, params.lessonSlug),
				eq(lessons.is_published, true)
			)
		});

		lesson = lessonRow ?? null;
	} catch (err) {
		console.error('Failed to load lesson:', err);
	}

	if (!lesson) {
		throw error(404, 'Lesson not found');
	}

	// Check access. Free previews stay open to everyone, suspended included;
	// everything else needs an active (non-suspended) member.
	const activeMember = !!profile && isActiveMember(profile);
	const canAccess = activeMember || lesson.is_free_preview;

	if (!canAccess) {
		if (profile?.is_member) {
			// A member who is not active is suspended
			throw error(403, SUSPENDED_MESSAGE);
		}

		// Redirect to checkout if not authorized
		throw redirect(303, `/checkout?redirectTo=/modules/${params.moduleSlug}/${params.lessonSlug}`);
	}

	const resources = activeMember ? lesson.resources : [];

	// Embed URL is built (and signed, when BUNNY_EMBED_TOKEN_KEY is set) on the server only
	const embedUrl = await getBunnyEmbedUrl(lesson.video_url);

	// Get all lessons in this module for navigation
	let moduleLessons: Array<
		Pick<
			typeof lessons.$inferSelect,
			'id' | 'title' | 'slug' | 'duration_minutes' | 'is_free_preview' | 'is_published' | 'order_index'
		>
	> = [];

	try {
		moduleLessons = await db
			.select({
				id: lessons.id,
				title: lessons.title,
				slug: lessons.slug,
				duration_minutes: lessons.duration_minutes,
				is_free_preview: lessons.is_free_preview,
				is_published: lessons.is_published,
				order_index: lessons.order_index
			})
			.from(lessons)
			.where(and(eq(lessons.module_id, moduleData.id), eq(lessons.is_published, true)))
			.orderBy(asc(lessons.order_index));
	} catch (err) {
		console.error('Failed to load module lessons:', err);
	}

	// Get user progress for all lessons in this module
	let progressMap: Record<string, { completed: boolean; completed_at: string | null }> = {};

	if (activeMember) {
		const lessonIds = moduleLessons.map((l) => l.id);

		if (lessonIds.length > 0) {
			try {
				const progress = await db
					.select({
						lesson_id: user_progress.lesson_id,
						completed: user_progress.completed,
						completed_at: user_progress.completed_at
					})
					.from(user_progress)
					.where(
						and(eq(user_progress.user_id, profile.id), inArray(user_progress.lesson_id, lessonIds))
					);

				progressMap = Object.fromEntries(
					progress.map((p) => [p.lesson_id, { completed: p.completed, completed_at: p.completed_at }])
				);
			} catch (err) {
				console.error('Failed to load progress:', err);
			}
		}
	}

	// Attach progress to lessons
	const lessonsWithProgress = moduleLessons.map((l) => ({
		...l,
		progress: progressMap[l.id] || null
	}));

	return {
		lesson: {
			...lesson,
			module: moduleData,
			resources,
			progress: progressMap[lesson.id] || null
		},
		embedUrl,
		module: {
			id: moduleData.id,
			title: moduleData.title,
			slug: moduleData.slug,
			is_published: moduleData.is_published,
			order_index: moduleData.order_index,
			is_bonus: moduleData.is_bonus,
			lessons: lessonsWithProgress
		},
		profile
	};
};
