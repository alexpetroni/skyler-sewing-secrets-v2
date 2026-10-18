import { requireAdmin } from '#lib/server/modules/auth/index.ts';
import { promoStatus } from '#lib/server/modules/commerce/index.ts';
import { parseQuery } from '#lib/shared/schemas/admin.ts';
import { promoListQuerySchema } from '#lib/shared/schemas/commerce.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { status } = parseQuery(promoListQuerySchema, event.url.searchParams);
	const now = new Date();
	const codes = (await event.locals.services.commerce.promo.list()).map((code) => ({
		id: code.id,
		code: code.code,
		description: code.description,
		discountType: code.discount_type,
		discountValue: code.discount_value,
		appliesTo: code.applies_to,
		productCount: code.productIds.length,
		redemptionCount: code.redemptionCount,
		maxRedemptions: code.max_redemptions,
		startsAt: code.starts_at,
		endsAt: code.ends_at,
		status: promoStatus(code, now)
	}));
	return {
		status: status ?? null,
		codes: status ? codes.filter((code) => code.status === status) : codes
	};
};
