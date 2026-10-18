import { desc, eq } from 'drizzle-orm';
import type { Db } from '../index.ts';
import { pricing_config, products } from '../schema/index.ts';

export const FLAGSHIP_SLUG = 'skylers-sewing-secrets';
export const FLAGSHIP_TITLE = "Skyler's Sewing Secrets — Lifetime Access";

export interface FlagshipProductResult {
	/** Id of the one `access_scope = 'all'` product, existing or just created. */
	product_id: string;
	/** 1 when this run created the row, 0 when it already existed. */
	products_inserted: number;
}

/** The flagship course, or `undefined` before `backfillFlagshipProduct` ran. */
export async function findFlagshipProduct(db: Db): Promise<{ id: string } | undefined> {
	const [row] = await db
		.select({ id: products.id })
		.from(products)
		.where(eq(products.access_scope, 'all'))
		.limit(1);
	return row;
}

/** Like `findFlagshipProduct`, for steps that cannot run without it. */
export async function requireFlagshipProduct(db: Db): Promise<{ id: string }> {
	const product = await findFlagshipProduct(db);
	if (!product) {
		throw new Error('No product with access_scope = "all": run the flagship-product step first');
	}
	return product;
}

/**
 * Creates the flagship course product from the active `pricing_config` row:
 * `kind 'course'`, `access_scope 'all'`, published and featured. Running it
 * again returns the id of the existing row and inserts nothing.
 */
export async function backfillFlagshipProduct(db: Db): Promise<FlagshipProductResult> {
	const existing = await findFlagshipProduct(db);
	if (existing) return { product_id: existing.id, products_inserted: 0 };

	const [pricing] = await db
		.select({ base_price: pricing_config.base_price, currency: pricing_config.currency })
		.from(pricing_config)
		.where(eq(pricing_config.is_active, true))
		.orderBy(desc(pricing_config.created_at))
		.limit(1);
	if (!pricing) throw new Error('No active pricing_config row to price the flagship product');

	const [created] = await db
		.insert(products)
		.values({
			slug: FLAGSHIP_SLUG,
			kind: 'course',
			access_scope: 'all',
			title: FLAGSHIP_TITLE,
			price: pricing.base_price,
			currency: pricing.currency,
			is_published: true,
			is_featured: true,
			sort_order: 0
		})
		.returning({ id: products.id });
	if (!created) throw new Error('products insert returned no row');
	return { product_id: created.id, products_inserted: 1 };
}
