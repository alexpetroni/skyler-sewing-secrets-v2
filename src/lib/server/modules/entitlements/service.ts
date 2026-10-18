import { and, desc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type { Logger } from '#lib/server/platform/index.ts';
import { DomainError } from '../errors.ts';

const { entitlements, products, product_items, lessons, profiles, audit_log } = schema;

export type Entitlement = typeof entitlements.$inferSelect;
export type EntitlementSource = Entitlement['source'];

export interface OwnedEntitlement extends Entitlement {
	product: { title: string; kind: 'course' | 'bundle' | 'single'; slug: string };
}

export interface GrantInput {
	userId: string;
	productId: string;
	source: EntitlementSource;
	orderItemId?: string | null;
	/** The admin behind a manual grant; recorded as `granted_by` and in `audit_log`. */
	actorId?: string;
	tx?: Tx;
}

export interface RevokeInput {
	userId: string;
	productId: string;
	reason: string;
	actorId?: string;
	tx?: Tx;
}

/** What `canAccessLesson` needs to know about the visitor; built once per request. */
export interface AccessContext {
	profile: { is_suspended: boolean } | null;
	accessibleLessonIds: ReadonlySet<string>;
	/** An active admin (never a suspended one). */
	isAdmin: boolean;
}

export type LockState = 'open' | 'locked' | 'suspended';

export interface EntitlementService {
	/** Idempotent: an existing active entitlement is returned unchanged. Syncs `is_member`. */
	grant(input: GrantInput): Promise<Entitlement>;
	/** Sets `revoked_at` on the active entitlement; null when there was none. Syncs `is_member`. */
	revoke(input: RevokeInput): Promise<Entitlement | null>;
	/** Revokes every active entitlement fulfilled by the given order items. */
	revokeByOrderItems(orderItemIds: string[], reason: string, tx?: Tx): Promise<Entitlement[]>;
	/** Active entitlements, newest first, with the product they unlock. */
	listForUser(userId: string): Promise<OwnedEntitlement[]>;
	ownedProductIds(userId: string): Promise<string[]>;
	hasAllAccess(userId: string): Promise<boolean>;
	/** One query: every lesson id for an all-access owner, otherwise the owned products' lessons. */
	accessibleLessonIds(userId: string): Promise<Set<string>>;
	/** `profiles.is_member = hasAllAccess(userId)`, for the legacy app sharing the database. */
	syncIsMember(userId: string, tx?: Tx): Promise<boolean>;
}

export interface CreateEntitlementServiceDeps {
	db: Db;
	log: Logger;
}

/**
 * Pure access decision: free preview → yes; nobody or suspended → no; admin
 * → yes; otherwise the lesson must be in the visitor's accessible set.
 */
export function canAccessLesson(
	ctx: AccessContext,
	lesson: { id: string; isFreePreview: boolean }
): boolean {
	if (lesson.isFreePreview) return true;
	if (!ctx.profile || ctx.profile.is_suspended) return false;
	if (ctx.isAdmin) return true;
	return ctx.accessibleLessonIds.has(lesson.id);
}

/** For list pages: why a lesson is not playable, if it is not. */
export function lockState(
	ctx: AccessContext,
	lesson: { id: string; isFreePreview: boolean }
): LockState {
	if (canAccessLesson(ctx, lesson)) return 'open';
	return ctx.profile?.is_suspended ? 'suspended' : 'locked';
}

export function createEntitlementService({
	db,
	log
}: CreateEntitlementServiceDeps): EntitlementService {
	const activeFor = (userId: string) =>
		and(eq(entitlements.user_id, userId), isNull(entitlements.revoked_at));

	async function allAccess(executor: Db | Tx, userId: string): Promise<boolean> {
		const [row] = await executor
			.select({ id: entitlements.id })
			.from(entitlements)
			.innerJoin(products, eq(products.id, entitlements.product_id))
			.where(and(activeFor(userId), eq(products.access_scope, 'all')))
			.limit(1);
		return row !== undefined;
	}

	async function syncIsMember(userId: string, tx?: Tx): Promise<boolean> {
		const executor = tx ?? db;
		const isMember = await allAccess(executor, userId);
		await executor
			.update(profiles)
			.set({ is_member: isMember, updated_at: sql`now()` })
			.where(and(eq(profiles.id, userId), sql`${profiles.is_member} IS DISTINCT FROM ${isMember}`));
		return isMember;
	}

	async function writeAudit(
		tx: Tx,
		actorId: string | undefined,
		action: string,
		entitlement: Entitlement,
		before: unknown,
		after: unknown
	): Promise<void> {
		if (!actorId) return;
		await tx.insert(audit_log).values({
			actor_id: actorId,
			action,
			entity: 'entitlement',
			entity_id: entitlement.id,
			before,
			after
		});
	}

	function inTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
		return tx ? fn(tx) : withTx(db, fn);
	}

	return {
		grant: ({ userId, productId, source, orderItemId = null, actorId, tx }) =>
			inTx(tx, async (tx) => {
				const [existing] = await tx
					.select()
					.from(entitlements)
					.where(and(activeFor(userId), eq(entitlements.product_id, productId)))
					.limit(1);
				if (existing) return existing;

				// Read through `tx`: a query on the base connection while a transaction
				// is open would wait for it forever on single-connection PGlite.
				const [product] = await tx
					.select({ id: products.id })
					.from(products)
					.where(eq(products.id, productId))
					.limit(1);
				if (!product) throw new DomainError('PRODUCT_NOT_FOUND', 'Product not found');
				const [created] = await tx
					.insert(entitlements)
					.values({
						user_id: userId,
						product_id: productId,
						source,
						order_item_id: orderItemId,
						granted_by: actorId ?? null
					})
					.returning();
				await writeAudit(tx, actorId, 'entitlement.grant', created, null, {
					user_id: userId,
					product_id: productId,
					source
				});
				await syncIsMember(userId, tx);
				log.info('entitlement granted', { userId, productId, source });
				return created;
			}),

		revoke: ({ userId, productId, reason, actorId, tx }) =>
			inTx(tx, async (tx) => {
				const [revoked] = await tx
					.update(entitlements)
					.set({ revoked_at: sql`now()`, revoke_reason: reason })
					.where(and(activeFor(userId), eq(entitlements.product_id, productId)))
					.returning();
				if (!revoked) return null;
				await writeAudit(
					tx,
					actorId,
					'entitlement.revoke',
					revoked,
					{ revoked_at: null },
					{ revoked_at: revoked.revoked_at, revoke_reason: reason }
				);
				await syncIsMember(userId, tx);
				log.info('entitlement revoked', { userId, productId });
				return revoked;
			}),

		revokeByOrderItems: (orderItemIds, reason, tx) =>
			inTx(tx, async (tx) => {
				if (orderItemIds.length === 0) return [];
				const revoked = await tx
					.update(entitlements)
					.set({ revoked_at: sql`now()`, revoke_reason: reason })
					.where(
						and(inArray(entitlements.order_item_id, orderItemIds), isNull(entitlements.revoked_at))
					)
					.returning();
				for (const userId of new Set(revoked.map((row) => row.user_id))) {
					await syncIsMember(userId, tx);
				}
				if (revoked.length > 0) {
					log.info('entitlements revoked by order items', { count: revoked.length });
				}
				return revoked;
			}),

		async listForUser(userId) {
			const rows = await db
				.select({
					entitlement: entitlements,
					title: products.title,
					kind: products.kind,
					slug: products.slug
				})
				.from(entitlements)
				.innerJoin(products, eq(products.id, entitlements.product_id))
				.where(activeFor(userId))
				.orderBy(desc(entitlements.granted_at), desc(entitlements.id));
			return rows.map(({ entitlement, title, kind, slug }) => ({
				...entitlement,
				product: { title, kind, slug }
			}));
		},

		async ownedProductIds(userId) {
			const rows = await db
				.select({ productId: entitlements.product_id })
				.from(entitlements)
				.where(activeFor(userId));
			return rows.map((row) => row.productId);
		},

		hasAllAccess: (userId) => allAccess(db, userId),

		async accessibleLessonIds(userId) {
			const ownsAllAccess = db
				.select({ id: entitlements.id })
				.from(entitlements)
				.innerJoin(products, eq(products.id, entitlements.product_id))
				.where(and(activeFor(userId), eq(products.access_scope, 'all')));
			const ownsLesson = db
				.select({ id: entitlements.id })
				.from(entitlements)
				.innerJoin(product_items, eq(product_items.product_id, entitlements.product_id))
				.where(and(activeFor(userId), eq(product_items.lesson_id, lessons.id)));
			const rows = await db
				.select({ id: lessons.id })
				.from(lessons)
				.where(or(exists(ownsAllAccess), exists(ownsLesson)));
			return new Set(rows.map((row) => row.id));
		},

		syncIsMember
	};
}
