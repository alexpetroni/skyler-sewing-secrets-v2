import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { confirmDeleteSchema, thumbnailTimeSchema } from '#lib/shared/schemas/admin.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	thumbnail: adminForm(thumbnailTimeSchema, { id: 'thumbnail' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The asset the page is about; anything but a uuid is a 404. */
function assetId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Video not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [asset, thumbnail, remove] = await Promise.all([
		event.locals.services.media.detail(assetId(event)),
		forms.thumbnail.empty(),
		forms.remove.empty()
	]);
	if (!asset) error(404, 'Video not found');
	return { asset, forms: { thumbnail, remove } };
};

export const actions: Actions = {
	thumbnail: async (event) => {
		const { user } = requireAdmin(event);
		const id = assetId(event);
		const parsed = await forms.thumbnail.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.media.setThumbnail(id, parsed.data.seconds, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Thumbnail requested; Bunny updates it in a few seconds.');
	},

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = assetId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.media.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/media');
	}
};
