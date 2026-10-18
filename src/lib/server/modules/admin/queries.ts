import {
	and,
	count,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	lte,
	ne,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { schema, type Db } from '#lib/server/db/index.ts';
import { ADMIN_PAGE_SIZE, type AdminOrderStatus } from '#lib/shared/schemas/admin.ts';
import type { ProductKind } from '#lib/shared/schemas/catalog.ts';

const {
	audit_log,
	contact_submissions,
	entitlements,
	media_assets,
	order_items,
	orders,
	products,
	profiles,
	promo_codes,
	promo_redemptions,
	sessions,
	user_progress,
	webhook_events
} = schema;

export interface Paged<T> {
	rows: T[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
}

function paged<T>(rows: T[], total: number, page: number): Paged<T> {
	return {
		rows,
		total,
		page,
		pageSize: ADMIN_PAGE_SIZE,
		pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))
	};
}

const offsetOf = (page: number) => (page - 1) * ADMIN_PAGE_SIZE;

/** `%term%` for ILIKE with the term's own `%`, `_` and `\` taken literally. */
function containing(term: string): string {
	return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Orders the buyer paid for at some point, whatever happened since. */
const PAID_STATUSES = ['paid', 'partially_refunded', 'refunded', 'disputed'] as const;

export const PRODUCT_KINDS: readonly ProductKind[] = ['course', 'bundle', 'single'];

export interface KindMetrics {
	kind: ProductKind;
	/** Pence, net of refunds; a disputed order counts as nothing. */
	revenue: number;
	/** Paid orders containing at least one product of this kind. */
	orders: number;
}

export interface TopProduct {
	productId: string;
	title: string;
	kind: ProductKind;
	revenue: number;
	units: number;
}

export interface ActivePromotion {
	id: string;
	code: string;
	redemptions: number;
}

export interface DashboardStats {
	/** Start of the 30-day window (ISO). */
	since: string;
	revenue: number;
	orders: number;
	refunded: number;
	byKind: KindMetrics[];
	newBuyers: number;
	topProducts: TopProduct[];
	activePromotions: ActivePromotion[];
	media: { processing: number; failed: number };
	unreadContacts: number;
}

export const DASHBOARD_WINDOW_DAYS = 30;

/** Line revenue: what was charged minus what was refunded; nothing for a disputed order. */
const lineRevenue = sql<number>`coalesce(sum(case when ${orders.status} = 'disputed' then 0 else ${order_items.unit_price} - ${order_items.refunded_amount} end), 0)`;

export async function dashboard(db: Db, now: Date): Promise<DashboardStats> {
	const nowIso = now.toISOString();
	const since = new Date(now.getTime() - DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const paidInWindow = and(
		inArray(orders.status, [...PAID_STATUSES]),
		isNotNull(orders.paid_at),
		gte(orders.paid_at, since),
		lte(orders.paid_at, nowIso)
	);

	const [totals] = await db
		.select({
			revenue: lineRevenue.mapWith(Number),
			orders: sql<number>`count(distinct ${orders.id})`.mapWith(Number),
			refunded: sql<number>`coalesce(sum(${order_items.refunded_amount}), 0)`.mapWith(Number)
		})
		.from(order_items)
		.innerJoin(orders, eq(orders.id, order_items.order_id))
		.where(paidInWindow);

	const kindRows = await db
		.select({
			kind: products.kind,
			revenue: lineRevenue.mapWith(Number),
			orders: sql<number>`count(distinct ${orders.id})`.mapWith(Number)
		})
		.from(order_items)
		.innerJoin(orders, eq(orders.id, order_items.order_id))
		.innerJoin(products, eq(products.id, order_items.product_id))
		.where(paidInWindow)
		.groupBy(products.kind);

	const topProducts = await db
		.select({
			productId: products.id,
			title: products.title,
			kind: products.kind,
			revenue: lineRevenue.mapWith(Number),
			units: count(order_items.id)
		})
		.from(order_items)
		.innerJoin(orders, eq(orders.id, order_items.order_id))
		.innerJoin(products, eq(products.id, order_items.product_id))
		.where(paidInWindow)
		.groupBy(products.id, products.title, products.kind)
		.orderBy(desc(lineRevenue), products.title)
		.limit(5);

	// A new buyer's first paid order falls inside the window.
	const firstPurchases = db
		.select({ userId: orders.user_id })
		.from(orders)
		.where(isNotNull(orders.paid_at))
		.groupBy(orders.user_id)
		.having(and(gte(sql`min(${orders.paid_at})`, since), lte(sql`min(${orders.paid_at})`, nowIso)))
		.as('first_purchases');
	const [buyers] = await db.select({ total: count() }).from(firstPurchases);

	// Redemptions as the promo service counts them: every order but expired ones.
	const activePromotions = await db
		.select({
			id: promo_codes.id,
			code: promo_codes.code,
			redemptions: sql<number>`count(${orders.id})`.mapWith(Number)
		})
		.from(promo_codes)
		.leftJoin(promo_redemptions, eq(promo_redemptions.promo_code_id, promo_codes.id))
		.leftJoin(orders, and(eq(orders.id, promo_redemptions.order_id), ne(orders.status, 'expired')))
		.where(
			and(
				eq(promo_codes.is_active, true),
				or(sql`${promo_codes.starts_at} is null`, lte(promo_codes.starts_at, nowIso)),
				or(sql`${promo_codes.ends_at} is null`, gt(promo_codes.ends_at, nowIso))
			)
		)
		.groupBy(promo_codes.id, promo_codes.code)
		.orderBy(promo_codes.code);

	const mediaRows = await db
		.select({ status: media_assets.status, total: count() })
		.from(media_assets)
		.where(inArray(media_assets.status, ['processing', 'failed']))
		.groupBy(media_assets.status);
	const mediaCount = (status: string) => mediaRows.find((row) => row.status === status)?.total ?? 0;

	const [unread] = await db
		.select({ total: count() })
		.from(contact_submissions)
		.where(eq(contact_submissions.is_read, false));

	return {
		since,
		revenue: totals?.revenue ?? 0,
		orders: totals?.orders ?? 0,
		refunded: totals?.refunded ?? 0,
		byKind: PRODUCT_KINDS.map((kind) => {
			const row = kindRows.find((entry) => entry.kind === kind);
			return { kind, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 };
		}),
		newBuyers: buyers?.total ?? 0,
		topProducts,
		activePromotions,
		media: { processing: mediaCount('processing'), failed: mediaCount('failed') },
		unreadContacts: unread?.total ?? 0
	};
}

export interface UserRow {
	id: string;
	email: string;
	fullName: string | null;
	avatarUrl: string | null;
	isMember: boolean;
	isAdmin: boolean;
	isSuspended: boolean;
	createdAt: string;
}

const userColumns = {
	id: profiles.id,
	email: profiles.email,
	fullName: profiles.full_name,
	avatarUrl: profiles.avatar_url,
	isMember: profiles.is_member,
	isAdmin: profiles.is_admin,
	isSuspended: profiles.is_suspended,
	createdAt: profiles.created_at
};

export async function searchUsers(db: Db, q: string, page: number): Promise<Paged<UserRow>> {
	const term = q.trim();
	const where = term
		? or(ilike(profiles.email, containing(term)), ilike(profiles.full_name, containing(term)))
		: undefined;
	const [{ total }] = await db.select({ total: count() }).from(profiles).where(where);
	const rows = await db
		.select(userColumns)
		.from(profiles)
		.where(where)
		.orderBy(desc(profiles.created_at), profiles.id)
		.limit(ADMIN_PAGE_SIZE)
		.offset(offsetOf(page));
	return paged(rows, total, page);
}

export interface UserEntitlementRow {
	id: string;
	productId: string;
	productTitle: string;
	productKind: ProductKind;
	source: 'purchase' | 'migration' | 'admin_grant' | 'gift';
	grantedAt: string;
	revokedAt: string | null;
	revokeReason: string | null;
	orderItemId: string | null;
	grantedBy: { id: string; email: string } | null;
}

const grantor = alias(profiles, 'grantor');

/** Every entitlement the user ever had, active first, with the admin who granted it. */
export async function userEntitlements(db: Db, userId: string): Promise<UserEntitlementRow[]> {
	const rows = await db
		.select({
			id: entitlements.id,
			productId: entitlements.product_id,
			productTitle: products.title,
			productKind: products.kind,
			source: entitlements.source,
			grantedAt: entitlements.granted_at,
			revokedAt: entitlements.revoked_at,
			revokeReason: entitlements.revoke_reason,
			orderItemId: entitlements.order_item_id,
			grantorId: grantor.id,
			grantorEmail: grantor.email
		})
		.from(entitlements)
		.innerJoin(products, eq(products.id, entitlements.product_id))
		.leftJoin(grantor, eq(grantor.id, entitlements.granted_by))
		.where(eq(entitlements.user_id, userId))
		.orderBy(sql`${entitlements.revoked_at} is not null`, desc(entitlements.granted_at));
	return rows.map(({ grantorId, grantorEmail, ...row }) => ({
		...row,
		grantedBy: grantorId && grantorEmail ? { id: grantorId, email: grantorEmail } : null
	}));
}

export interface ProgressSummary {
	started: number;
	completed: number;
	lastActivityAt: string | null;
}

export async function progressSummary(db: Db, userId: string): Promise<ProgressSummary> {
	const [row] = await db
		.select({
			started: count(),
			completed: sql<number>`count(*) filter (where ${user_progress.completed})`.mapWith(Number),
			lastActivityAt: sql<string | null>`max(${user_progress.updated_at})`
		})
		.from(user_progress)
		.where(eq(user_progress.user_id, userId));
	return {
		started: row?.started ?? 0,
		completed: row?.completed ?? 0,
		lastActivityAt: row?.lastActivityAt ?? null
	};
}

export async function activeSessionCount(db: Db, userId: string, now: Date): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(sessions)
		.where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)));
	return row?.total ?? 0;
}

export interface OrderRow {
	id: string;
	status: AdminOrderStatus;
	userId: string;
	email: string;
	total: number;
	currency: string;
	itemCount: number;
	createdAt: string;
	paidAt: string | null;
}

export interface OrderListParams {
	status?: AdminOrderStatus;
	q?: string;
	page: number;
}

/** Search matches the buyer's email, the order id or a Stripe session / payment intent id. */
export async function listOrders(
	db: Db,
	{ status, q = '', page }: OrderListParams
): Promise<Paged<OrderRow>> {
	const term = q.trim();
	const conditions: SQL[] = [];
	if (status) conditions.push(eq(orders.status, status));
	if (term) {
		const matches: SQL[] = [
			ilike(profiles.email, containing(term)),
			eq(orders.stripe_checkout_session_id, term),
			eq(orders.stripe_payment_intent_id, term)
		];
		if (UUID.test(term)) matches.push(eq(orders.id, term));
		conditions.push(or(...matches) as SQL);
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [{ total }] = await db
		.select({ total: count() })
		.from(orders)
		.innerJoin(profiles, eq(profiles.id, orders.user_id))
		.where(where);
	const rows = await db
		.select({
			id: orders.id,
			status: orders.status,
			userId: orders.user_id,
			email: profiles.email,
			total: orders.total,
			currency: orders.currency,
			itemCount:
				sql<number>`(select count(*) from ${order_items} where ${order_items.order_id} = ${orders.id})`.mapWith(
					Number
				),
			createdAt: orders.created_at,
			paidAt: orders.paid_at
		})
		.from(orders)
		.innerJoin(profiles, eq(profiles.id, orders.user_id))
		.where(where)
		.orderBy(desc(orders.created_at), orders.id)
		.limit(ADMIN_PAGE_SIZE)
		.offset(offsetOf(page));
	return paged(rows, total, page);
}

export interface WebhookEventRow {
	id: string;
	eventId: string;
	type: string;
	receivedAt: string;
	processedAt: string | null;
	error: string | null;
}

/** Stripe deliveries about the order's checkout session or payment intent, oldest first. */
export async function webhookEventsFor(
	db: Db,
	references: Array<string | null>
): Promise<WebhookEventRow[]> {
	const known = references.filter((reference): reference is string => !!reference);
	if (known.length === 0) return [];
	return db
		.select({
			id: webhook_events.id,
			eventId: webhook_events.event_id,
			type: webhook_events.type,
			receivedAt: webhook_events.received_at,
			processedAt: webhook_events.processed_at,
			error: webhook_events.error
		})
		.from(webhook_events)
		.where(and(eq(webhook_events.provider, 'stripe'), inArray(webhook_events.reference, known)))
		.orderBy(webhook_events.received_at, webhook_events.id);
}

export interface AuditRow {
	id: string;
	action: string;
	entity: string;
	entityId: string | null;
	actor: { id: string; email: string } | null;
	before: unknown;
	after: unknown;
	createdAt: string;
}

export interface AuditListParams {
	entity?: string;
	entityId?: string;
	actorId?: string;
	page: number;
}

const actor = alias(profiles, 'actor');

export async function listAudit(
	db: Db,
	{ entity, entityId, actorId, page }: AuditListParams
): Promise<Paged<AuditRow>> {
	const conditions: SQL[] = [];
	if (entity) conditions.push(eq(audit_log.entity, entity));
	if (entityId) conditions.push(eq(audit_log.entity_id, entityId));
	if (actorId) conditions.push(eq(audit_log.actor_id, actorId));
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [{ total }] = await db.select({ total: count() }).from(audit_log).where(where);
	const rows = await db
		.select({
			id: audit_log.id,
			action: audit_log.action,
			entity: audit_log.entity,
			entityId: audit_log.entity_id,
			actorId: actor.id,
			actorEmail: actor.email,
			before: audit_log.before,
			after: audit_log.after,
			createdAt: audit_log.created_at
		})
		.from(audit_log)
		.leftJoin(actor, eq(actor.id, audit_log.actor_id))
		.where(where)
		.orderBy(desc(audit_log.created_at), desc(audit_log.id))
		.limit(ADMIN_PAGE_SIZE)
		.offset(offsetOf(page));
	return paged(
		rows.map(({ actorId: id, actorEmail: email, ...row }) => ({
			...row,
			actor: id && email ? { id, email } : null
		})),
		total,
		page
	);
}
