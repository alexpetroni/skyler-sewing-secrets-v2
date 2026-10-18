import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { PageServerLoad } from './$types';

// The upload itself goes browser → Bunny with a ticket from /admin/api/upload-ticket.
export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return {};
};
