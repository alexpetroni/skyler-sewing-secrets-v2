import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { idSchema, lessonInputSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const lessonForm = adminForm(lessonInputSchema, { id: 'lesson' });

/** Field each refusal belongs to; anything else (`MEDIA_NOT_READY`) is shown above the form. */
const errorFields = {
	SLUG_TAKEN: 'slug',
	MODULE_NOT_FOUND: 'moduleId',
	MEDIA_NOT_FOUND: 'mediaAssetId'
};

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { content, media } = event.locals.services;
	const requested = event.url.searchParams.get('module');
	const [modules, assets, form] = await Promise.all([
		content.modules.list(),
		media.list(),
		lessonForm.empty()
	]);
	return {
		// `?module=<id>` from a module page starts the lesson there; otherwise standalone.
		moduleId: v.is(idSchema, requested) ? requested : null,
		modules: modules.map((module) => ({ id: module.id, title: module.title })),
		assets,
		form
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await lessonForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let lessonId: string;
		try {
			lessonId = (await event.locals.services.content.lessons.create(parsed.data, user.id)).id;
		} catch (err) {
			return mapDomainError(parsed.form, err, errorFields);
		}
		redirect(303, `/admin/content/lessons/${lessonId}`);
	}
};
