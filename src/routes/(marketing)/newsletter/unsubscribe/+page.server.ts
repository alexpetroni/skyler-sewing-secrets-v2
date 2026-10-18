import { error, fail } from '@sveltejs/kit';
import { readForm } from '#lib/server/http/forms.ts';
import type { Actions, PageServerLoad } from './$types';

const INVALID_LINK = 'This unsubscribe link is invalid.';

// GET only verifies the signed link and shows a confirm button. It never
// touches the database: mail clients and link scanners prefetch URLs.
export const load: PageServerLoad = async ({ url, locals }) => {
	const email = url.searchParams.get('email')?.trim().toLowerCase() ?? '';
	const token = url.searchParams.get('token') ?? '';

	if (
		!email ||
		!token ||
		!locals.services.marketing.newsletter.verifyUnsubscribeToken(email, token)
	) {
		error(400, INVALID_LINK);
	}
	return { email, token };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await readForm(request);
		// Re-verified by the service: the form fields are attacker-controlled input.
		const done = await locals.services.marketing.newsletter.unsubscribe(
			form.email ?? '',
			form.token ?? ''
		);
		if (!done) return fail(400, { error: INVALID_LINK });
		return { success: true };
	}
};
