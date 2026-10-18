import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		await locals.services.auth.api.signOut({ headers: request.headers });
	} catch (err) {
		locals.services.logger.warn('signOut failed', {
			requestId: locals.requestId,
			error: err instanceof Error ? err.message : String(err)
		});
	}
	redirect(303, '/');
};
