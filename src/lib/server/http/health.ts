import { sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/index.ts';

/** Runs `select 1`; rejects when the database fails or does not answer in time. */
export async function checkDatabase(db: Db, timeoutMs = 5000): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			db.execute(sql`select 1`),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('database check timed out')), timeoutMs);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}
