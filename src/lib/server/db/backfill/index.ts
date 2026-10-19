import { withTx, type Db } from '../index.ts';
import { backfillPromoCodes, type PromoCodeCounts } from './promo-codes.ts';
import { backfillMediaAssets, type MediaAssetCounts } from './media-assets.ts';
import { backfillFlagshipProduct, type FlagshipProductResult } from './flagship-product.ts';
import { backfillOrders, type OrderCounts } from './orders.ts';
import { backfillEntitlements, type EntitlementCounts } from './entitlements.ts';

export { backfillPromoCodes, type PromoCodeCounts } from './promo-codes.ts';
export { backfillMediaAssets, type MediaAssetCounts } from './media-assets.ts';
export {
	backfillFlagshipProduct,
	findFlagshipProduct,
	requireFlagshipProduct,
	FLAGSHIP_SLUG,
	FLAGSHIP_TITLE,
	type FlagshipProductResult
} from './flagship-product.ts';
export { backfillOrders, type OrderCounts } from './orders.ts';
export { backfillEntitlements, type EntitlementCounts } from './entitlements.ts';

/** Steps in dependency order: orders need the product, entitlements need both. */
export const BACKFILL_STEPS = [
	'promo-codes',
	'media-assets',
	'flagship-product',
	'orders',
	'entitlements'
] as const;

export type BackfillStep = (typeof BACKFILL_STEPS)[number];

export function isBackfillStep(value: string): value is BackfillStep {
	return (BACKFILL_STEPS as readonly string[]).includes(value);
}

export interface BackfillResult {
	'promo-codes'?: PromoCodeCounts;
	'media-assets'?: MediaAssetCounts;
	'flagship-product'?: FlagshipProductResult;
	orders?: OrderCounts;
	entitlements?: EntitlementCounts;
}

/**
 * Runs one step inside its own transaction, so a failure half-way (a lost
 * connection after an `orders` row but before its `order_items`) leaves
 * nothing behind for the next run to skip over. Steps after
 * `flagship-product` throw when the product is missing.
 */
export function runStep(db: Db, step: BackfillStep): Promise<BackfillResult> {
	return withTx(db, async (tx) => {
		switch (step) {
			case 'promo-codes':
				return { 'promo-codes': await backfillPromoCodes(tx) };
			case 'media-assets':
				return { 'media-assets': await backfillMediaAssets(tx) };
			case 'flagship-product':
				return { 'flagship-product': await backfillFlagshipProduct(tx) };
			case 'orders':
				return { orders: await backfillOrders(tx) };
			case 'entitlements':
				return { entitlements: await backfillEntitlements(tx) };
		}
	});
}

/**
 * Runs every step in dependency order inside one transaction, so a failure
 * half-way leaves the database as it was. Idempotent: a second run returns
 * zero for every count and the same flagship `product_id`.
 */
export function runAll(db: Db): Promise<Required<BackfillResult>> {
	return withTx(db, async (tx) => ({
		'promo-codes': await backfillPromoCodes(tx),
		'media-assets': await backfillMediaAssets(tx),
		'flagship-product': await backfillFlagshipProduct(tx),
		orders: await backfillOrders(tx),
		entitlements: await backfillEntitlements(tx)
	}));
}
