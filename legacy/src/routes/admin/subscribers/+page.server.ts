import type { PageServerLoad } from './$types';
import { desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { newsletter_subscribers } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const subscribers = await db
		.select()
		.from(newsletter_subscribers)
		.orderBy(desc(newsletter_subscribers.subscribed_at));

	return {
		subscribers
	};
};
