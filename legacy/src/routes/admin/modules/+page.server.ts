import type { PageServerLoad } from './$types';
import { eq, asc, count, getTableColumns } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { modules, lessons } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	try {
		const modulesWithCount = await db
			.select({
				...getTableColumns(modules),
				lessons_count: count(lessons.id)
			})
			.from(modules)
			.leftJoin(lessons, eq(lessons.module_id, modules.id))
			.groupBy(modules.id)
			.orderBy(asc(modules.order_index));

		return {
			modules: modulesWithCount
		};
	} catch (err) {
		console.error('Failed to load modules:', err);
		return {
			modules: []
		};
	}
};
