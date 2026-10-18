import { and, asc, eq, isNull, notExists } from 'drizzle-orm';
import type { Db } from '../index.ts';
import { entitlements, order_items, orders, profiles } from '../schema/index.ts';
import { requireFlagshipProduct } from './flagship-product.ts';

export interface EntitlementCounts {
	/** Members with a paid order: `source 'purchase'`, linked to its item. */
	entitlements_from_purchase: number;
	/** Members without one: `source 'migration'`. */
	entitlements_from_migration: number;
}

/**
 * Gives every `profiles.is_member = true` account an active entitlement to the
 * flagship product. Members who already hold one are skipped, so re-runs
 * insert nothing. `granted_at` is `member_since`, falling back to the
 * profile's `created_at`. `is_member` itself is not touched here.
 */
export async function backfillEntitlements(db: Db): Promise<EntitlementCounts> {
	const product = await requireFlagshipProduct(db);

	const members = await db
		.select({
			id: profiles.id,
			member_since: profiles.member_since,
			created_at: profiles.created_at
		})
		.from(profiles)
		.where(
			and(
				eq(profiles.is_member, true),
				notExists(
					db
						.select({ id: entitlements.id })
						.from(entitlements)
						.where(
							and(
								eq(entitlements.user_id, profiles.id),
								eq(entitlements.product_id, product.id),
								isNull(entitlements.revoked_at)
							)
						)
				)
			)
		)
		.orderBy(profiles.created_at, profiles.id);

	const counts: EntitlementCounts = {
		entitlements_from_purchase: 0,
		entitlements_from_migration: 0
	};

	for (const member of members) {
		const [paidItem] = await db
			.select({ id: order_items.id })
			.from(order_items)
			.innerJoin(orders, eq(order_items.order_id, orders.id))
			.where(
				and(
					eq(orders.user_id, member.id),
					eq(orders.status, 'paid'),
					eq(order_items.product_id, product.id)
				)
			)
			.orderBy(asc(orders.paid_at), asc(orders.id))
			.limit(1);

		await db.insert(entitlements).values({
			user_id: member.id,
			product_id: product.id,
			order_item_id: paidItem?.id ?? null,
			source: paidItem ? 'purchase' : 'migration',
			granted_at: member.member_since ?? member.created_at
		});
		if (paidItem) counts.entitlements_from_purchase += 1;
		else counts.entitlements_from_migration += 1;
	}

	return counts;
}
