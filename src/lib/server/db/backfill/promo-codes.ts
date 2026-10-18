import { and, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../index.ts';
import { promo_codes } from '../schema/index.ts';

export interface PromoCodeCounts {
	/** Codes whose v2 columns were filled from the legacy ones. */
	promo_codes_updated: number;
}

/**
 * Copies the legacy validity columns into their v2 successors where the v2
 * column is still null: `valid_from → starts_at`, `valid_until → ends_at`,
 * `max_uses → max_redemptions`, `min_purchase_amount → min_subtotal`. Values
 * an admin has already set in v2 are left alone, so re-runs touch nothing.
 */
export async function backfillPromoCodes(db: Db): Promise<PromoCodeCounts> {
	const updated = await db
		.update(promo_codes)
		.set({
			starts_at: sql`coalesce(${promo_codes.starts_at}, ${promo_codes.valid_from})`,
			ends_at: sql`coalesce(${promo_codes.ends_at}, ${promo_codes.valid_until})`,
			max_redemptions: sql`coalesce(${promo_codes.max_redemptions}, ${promo_codes.max_uses})`,
			min_subtotal: sql`coalesce(${promo_codes.min_subtotal}, ${promo_codes.min_purchase_amount})`
		})
		.where(
			or(
				isNull(promo_codes.starts_at),
				and(isNull(promo_codes.ends_at), isNotNull(promo_codes.valid_until)),
				and(isNull(promo_codes.max_redemptions), isNotNull(promo_codes.max_uses)),
				and(isNull(promo_codes.min_subtotal), isNotNull(promo_codes.min_purchase_amount))
			)
		)
		.returning({ id: promo_codes.id });
	return { promo_codes_updated: updated.length };
}
