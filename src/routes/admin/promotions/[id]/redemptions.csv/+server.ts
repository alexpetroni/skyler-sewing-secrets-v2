import * as v from 'valibot';
import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { idSchema } from '#lib/shared/schemas/content.ts';
import type { RequestHandler } from './$types';

/** The redemption table as a download; every cell quoted and formula-neutralised. */
export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const { promo } = event.locals.services.commerce;
	const id = event.params.id;
	const code = v.is(idSchema, id) ? await promo.getById(id) : null;
	if (!code) return new Response('Promotion not found', { status: 404 });
	return new Response(await promo.exportRedemptionsCsv(code.id), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${code.code.toLowerCase()}-redemptions.csv"`,
			'cache-control': 'no-store'
		}
	});
};
