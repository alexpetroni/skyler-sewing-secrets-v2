import { message } from 'sveltekit-superforms/server';
import { adminForm } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { HOME_PREVIEW_LESSON_KEY } from '#lib/server/modules/content/index.ts';
import { MAINTENANCE_KEY } from '#lib/server/modules/marketing/index.ts';
import {
	emptyActionSchema,
	homePreviewSchema,
	maintenanceOnSchema
} from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	maintenanceOn: adminForm(maintenanceOnSchema, { id: 'maintenanceOn' }),
	maintenanceOff: adminForm(emptyActionSchema, { id: 'maintenanceOff' }),
	preview: adminForm(homePreviewSchema, { id: 'preview' })
};

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { content, marketing } = event.locals.services;
	const [
		maintenance,
		previewLessonId,
		candidates,
		current,
		maintenanceOn,
		maintenanceOff,
		preview
	] = await Promise.all([
		marketing.settings.get(MAINTENANCE_KEY),
		marketing.settings.get(HOME_PREVIEW_LESSON_KEY),
		content.lessons.list({ freePreview: true }),
		content.freePreviewLesson(),
		forms.maintenanceOn.empty(),
		forms.maintenanceOff.empty(),
		forms.preview.empty()
	]);
	return {
		maintenanceMode: maintenance === 'true',
		previewLessonId: previewLessonId ?? '',
		previewLessons: candidates.map(({ lesson, moduleTitle }) => ({
			id: lesson.id,
			title: lesson.title,
			moduleTitle,
			isPublished: lesson.is_published
		})),
		currentPreview: current && { id: current.lesson.id, title: current.lesson.title },
		contactEmail: marketing.contact.recipient,
		forms: { maintenanceOn, maintenanceOff, preview }
	};
};

export const actions: Actions = {
	maintenanceOn: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await forms.maintenanceOn.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		await event.locals.services.marketing.settings.set(MAINTENANCE_KEY, 'true', user.id);
		return message(parsed.form, 'Maintenance mode is on.');
	},

	maintenanceOff: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await forms.maintenanceOff.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		await event.locals.services.marketing.settings.set(MAINTENANCE_KEY, 'false', user.id);
		return message(parsed.form, 'Maintenance mode is off.');
	},

	preview: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await forms.preview.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		await event.locals.services.marketing.settings.set(
			HOME_PREVIEW_LESSON_KEY,
			parsed.data.lessonId,
			user.id
		);
		return message(parsed.form, 'Homepage preview saved.');
	}
};
