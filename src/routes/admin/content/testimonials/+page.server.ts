import type { RequestEvent } from '@sveltejs/kit';
import { message } from 'sveltekit-superforms/server';
import { adminForm, mapDomainError } from '#lib/server/http/forms.ts';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import type { MarketingService } from '#lib/server/modules/marketing/index.ts';
import { rowActionSchema } from '#lib/shared/schemas/admin.ts';
import type { Actions, PageServerLoad } from './$types';

const rowForm = adminForm(rowActionSchema, { id: 'row' });

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [testimonials, row] = await Promise.all([
		event.locals.services.marketing.testimonials.listAll(),
		rowForm.empty()
	]);
	return { testimonials, forms: { row } };
};

type Moderation = (
	testimonials: MarketingService['testimonials'],
	id: string,
	actorId: string
) => Promise<unknown>;

/** One per-row button: the action name says what to do with the testimonial. */
function moderate(run: Moderation, done: string) {
	return async (event: RequestEvent) => {
		const { user } = requireAdmin(event);
		const parsed = await rowForm.parse(event.request);
		if (!parsed.ok) return parsed.failure;
		try {
			await run(event.locals.services.marketing.testimonials, parsed.data.id, user.id);
		} catch (err) {
			return mapDomainError(parsed.form, err);
		}
		return message(parsed.form, done);
	};
}

export const actions: Actions = {
	publish: moderate((t, id, actor) => t.setPublished(id, true, actor), 'Testimonial published.'),
	unpublish: moderate(
		(t, id, actor) => t.setPublished(id, false, actor),
		'Testimonial unpublished.'
	),
	feature: moderate((t, id, actor) => t.setFeatured(id, true, actor), 'Testimonial featured.'),
	unfeature: moderate(
		(t, id, actor) => t.setFeatured(id, false, actor),
		'Testimonial no longer featured.'
	),
	moveUp: moderate((t, id, actor) => t.move(id, 'up', actor), 'Order saved.'),
	moveDown: moderate((t, id, actor) => t.move(id, 'down', actor), 'Order saved.')
};
