import { error } from '@sveltejs/kit';
import { requireUser } from '#lib/server/modules/auth/index.ts';
import type { RequestHandler } from './$types';

/** GDPR data export: the signed-in member's own data as a JSON download. */
export const GET: RequestHandler = async (event) => {
	const { user } = requireUser(event, '/profile/export');
	const data = await event.locals.services.users.exportData(user.id);
	if (!data) error(404, 'Account not found');
	return Response.json(data, {
		headers: {
			'content-disposition': 'attachment; filename="skylers-sewing-secrets-account.json"',
			'cache-control': 'no-store'
		}
	});
};
