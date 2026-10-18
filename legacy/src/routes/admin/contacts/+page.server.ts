import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contact_submissions } from '$lib/server/db/schema';
import { isUuid } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	const contacts = await db
		.select()
		.from(contact_submissions)
		.orderBy(desc(contact_submissions.created_at));

	return {
		contacts
	};
};

export const actions: Actions = {
	markRead: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString() ?? '';

		if (!isUuid(id)) {
			return fail(400, { error: 'Invalid contact ID' });
		}

		try {
			await db
				.update(contact_submissions)
				.set({ is_read: true })
				.where(eq(contact_submissions.id, id));
		} catch (error) {
			console.error('Failed to update contact:', error);
			return fail(500, { error: 'Failed to update contact' });
		}

		return { success: true };
	}
};
