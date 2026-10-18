import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import {
	confirmDeleteSchema,
	lessonResourceSchema,
	removeResourceSchema
} from '#lib/shared/schemas/admin.ts';
import { idSchema, lessonInputSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	update: adminForm(lessonInputSchema, { id: 'lesson' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' }),
	addResource: adminForm(lessonResourceSchema, { id: 'addResource' }),
	removeResource: adminForm(removeResourceSchema, { id: 'removeResource' })
};

/** Field each refusal belongs to; anything else (`MEDIA_NOT_READY`) is shown above the form. */
const errorFields = {
	SLUG_TAKEN: 'slug',
	MODULE_NOT_FOUND: 'moduleId',
	MEDIA_NOT_FOUND: 'mediaAssetId'
};

/** The lesson the page is about; anything but a uuid is a 404. */
function lessonId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Lesson not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = lessonId(event);
	const { content, media } = event.locals.services;
	const [lesson, modules, assets, resources, update, remove, addResource, removeResource] =
		await Promise.all([
			content.lessons.getById(id),
			content.modules.list(),
			media.list(),
			content.resources.listForLesson(id),
			forms.update.empty(),
			forms.remove.empty(),
			forms.addResource.empty(),
			forms.removeResource.empty()
		]);
	if (!lesson) error(404, 'Lesson not found');
	return {
		lesson,
		modules: modules.map((module) => ({ id: module.id, title: module.title })),
		assets,
		resources,
		forms: { update, remove, addResource, removeResource }
	};
};

export const actions: Actions = {
	update: async (event) => {
		const { user } = requireAdmin(event);
		const id = lessonId(event);
		const parsed = await forms.update.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.lessons.update(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err, errorFields);
		}
		return message(parsed.form, 'Lesson saved.');
	},

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = lessonId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.lessons.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/content/lessons');
	},

	addResource: async (event) => {
		const { user } = requireAdmin(event);
		const id = lessonId(event);
		const parsed = await forms.addResource.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.resources.add({
				lessonId: id,
				title: parsed.data.title,
				fileUrl: parsed.data.fileUrl,
				actorId: user.id
			});
		} catch (err) {
			return mapDomainError(parsed.form, err, { INVALID_URL: 'fileUrl' });
		}
		return message(parsed.form, 'Resource added.');
	},

	removeResource: async (event) => {
		const { user } = requireAdmin(event);
		lessonId(event);
		const parsed = await forms.removeResource.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.content.resources.remove(parsed.data.resourceId, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, 'Resource removed.');
	}
};
