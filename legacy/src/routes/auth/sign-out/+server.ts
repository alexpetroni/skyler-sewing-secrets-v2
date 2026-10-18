import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
	try {
		await getAuth().api.signOut({ headers: request.headers });
	} catch (error) {
		console.error('[sign-out] Error:', error);
	}
	redirect(303, '/');
};
