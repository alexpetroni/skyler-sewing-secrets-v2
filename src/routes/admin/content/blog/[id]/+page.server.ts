import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import * as v from 'valibot';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import {
	blogPostSchema,
	confirmDeleteSchema,
	emptyActionSchema
} from '#lib/shared/schemas/admin.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { Actions, PageServerLoad } from './$types';

const forms = {
	update: adminForm(blogPostSchema, { id: 'post' }),
	publish: adminForm(emptyActionSchema, { id: 'publish' }),
	remove: adminForm(confirmDeleteSchema, { id: 'delete' })
};

/** The post the page is about; anything but a uuid is a 404. */
function postId(event: RequestEvent): string {
	const id = event.params.id;
	if (!v.is(idSchema, id)) error(404, 'Post not found');
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = postId(event);
	const [post, update, publish, remove] = await Promise.all([
		event.locals.services.marketing.blog.getById(id),
		forms.update.empty(),
		forms.publish.empty(),
		forms.remove.empty()
	]);
	if (!post) error(404, 'Post not found');
	return { post, forms: { update, publish, remove } };
};

function setPublished(published: boolean) {
	return async (event: RequestEvent) => {
		const { user } = requireAdmin(event);
		const id = postId(event);
		const parsed = await forms.publish.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		const { blog } = event.locals.services.marketing;
		try {
			await (published ? blog.publish(id, user.id) : blog.unpublish(id, user.id));
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, published ? 'Post published.' : 'Post moved back to draft.');
	};
}

export const actions: Actions = {
	update: async (event) => {
		const { user } = requireAdmin(event);
		const id = postId(event);
		const parsed = await forms.update.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.blog.update(id, parsed.data, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err, { SLUG_TAKEN: 'slug' });
		}
		return message(parsed.form, 'Post updated successfully.');
	},

	publish: setPublished(true),
	unpublish: setPublished(false),

	delete: async (event) => {
		const { user } = requireAdmin(event);
		const id = postId(event);
		const parsed = await forms.remove.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await event.locals.services.marketing.blog.remove(id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, '/admin/content/blog');
	}
};
