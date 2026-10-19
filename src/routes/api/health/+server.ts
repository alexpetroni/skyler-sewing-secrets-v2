import { version } from '$app/env';
import { checkDatabase } from '#lib/server/http/health.ts';
import type { RequestHandler } from './$types';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Liveness plus a database round trip. Answers only `status`, `db` and the
 * build version: no configuration, no error detail.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		await checkDatabase(locals.services.db);
		return Response.json({ status: 'ok', db: 'ok', version }, { headers: NO_STORE });
	} catch (err) {
		locals.log.error('health check failed', {
			error: err instanceof Error ? err.message : String(err)
		});
		return Response.json({ status: 'degraded', db: 'error' }, { status: 503, headers: NO_STORE });
	}
};
