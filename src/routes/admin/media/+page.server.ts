import { message } from 'sveltekit-superforms/server';
import { adminForm } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { emptyActionSchema, mediaListQuerySchema, parseQuery } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const syncForm = adminForm(emptyActionSchema, { id: 'sync' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const query = parseQuery(mediaListQuerySchema, event.url.searchParams);
	const [assets, sync] = await Promise.all([
		event.locals.services.media.list({ search: query.q || undefined, status: query.status }),
		syncForm.empty()
	]);
	return { assets, query, forms: { sync } };
};

export const actions: Actions = {
	sync: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await syncForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		// Every asset still uploading or processing, however recent: the admin asked now.
		const { synced, failedAssetIds } = await event.locals.services.media.syncProcessing({
			olderThanMinutes: 0,
			actorId: user.id
		});
		const failed =
			failedAssetIds.length > 0 ? `, ${failedAssetIds.length} could not be reached` : '';
		return message(parsed.form, `Synced ${synced} video${synced === 1 ? '' : 's'}${failed}.`);
	}
};
