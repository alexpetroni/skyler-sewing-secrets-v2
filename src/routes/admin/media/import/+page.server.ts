import { message } from 'sveltekit-superforms/server';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import {
	emptyActionSchema,
	importVideoSchema,
	LIBRARY_PAGE_SIZE,
	libraryQuerySchema,
	parseQuery
} from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	importVideo: adminForm(importVideoSchema, { id: 'importVideo' }),
	importPage: adminForm(emptyActionSchema, { id: 'importPage' })
};

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { q, page } = parseQuery(libraryQuerySchema, event.url.searchParams);
	const [library, importVideo, importPage] = await Promise.all([
		event.locals.services.media.browseLibrary({
			page,
			perPage: LIBRARY_PAGE_SIZE,
			search: q || undefined
		}),
		forms.importVideo.empty(),
		forms.importPage.empty()
	]);
	return {
		q,
		library: {
			items: library.items,
			page,
			pageCount: Math.max(1, Math.ceil(library.total / LIBRARY_PAGE_SIZE)),
			total: library.total
		},
		forms: { importVideo, importPage }
	};
};

export const actions: Actions = {
	importVideo: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await forms.importVideo.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.media.importVideo(parsed.data.videoId, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Video imported.');
	},

	importPage: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await forms.importPage.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		const { q, page } = parseQuery(libraryQuerySchema, event.url.searchParams);
		const { items } = await event.locals.services.media.importFromLibrary({
			page,
			perPage: LIBRARY_PAGE_SIZE,
			search: q || undefined,
			actorId: user.id
		});
		return message(parsed.form, `Imported ${items.length} video${items.length === 1 ? '' : 's'}.`);
	}
};
