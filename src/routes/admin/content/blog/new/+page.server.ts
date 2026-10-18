import { redirect } from '@sveltejs/kit';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { blogPostSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const postForm = adminForm(blogPostSchema, { id: 'post' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return { form: await postForm.empty() };
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await postForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let postId: string;
		try {
			postId = (await event.locals.services.marketing.blog.create(parsed.data, user.id)).id;
		} catch (err) {
			return mapDomainError(parsed.form, err, {
				SLUG_TAKEN: 'slug',
				CONTENT_REQUIRED: 'contentMd'
			});
		}
		redirect(303, `/admin/content/blog/${postId}`);
	}
};
