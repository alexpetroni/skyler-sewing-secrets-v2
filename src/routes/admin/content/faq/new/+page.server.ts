import { redirect } from '@sveltejs/kit';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { faqItemSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const faqForm = adminForm(faqItemSchema, { id: 'faq' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [faqs, form] = await Promise.all([
		event.locals.services.marketing.faq.listAll(),
		faqForm.empty()
	]);
	// New questions go last unless the admin says otherwise.
	const nextOrderIndex = faqs.reduce((max, faq) => Math.max(max, faq.order_index + 1), 0);
	return { nextOrderIndex, form };
};

export const actions: Actions = {
	create: async (event) => {
		const { user } = requireAdmin(event);
		const parsed = await faqForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		let faqId: string;
		try {
			faqId = (await event.locals.services.marketing.faq.create(parsed.data, user.id)).id;
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		redirect(303, `/admin/content/faq/${faqId}`);
	}
};
