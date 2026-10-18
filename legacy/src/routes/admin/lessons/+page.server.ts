import type { PageServerLoad } from './$types';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { modules, lessons } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	try {
		const [lessonRows, moduleRows] = await Promise.all([
			db.query.lessons.findMany({
				with: {
					module: {
						columns: {
							id: true,
							title: true
						}
					}
				},
				orderBy: [asc(lessons.module_id), asc(lessons.order_index)]
			}),
			db.select({ id: modules.id, title: modules.title }).from(modules).orderBy(asc(modules.order_index))
		]);

		return {
			lessons: lessonRows,
			modules: moduleRows
		};
	} catch (err) {
		console.error('Failed to load lessons:', err);
		return {
			lessons: [],
			modules: []
		};
	}
};
