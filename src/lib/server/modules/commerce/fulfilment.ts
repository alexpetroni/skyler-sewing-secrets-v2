import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type {
	CheckoutSessionView,
	GatewayEvent,
	Logger,
	Mailer
} from '#lib/server/platform/index.ts';
import type { AuthService } from '../auth/index.ts';
import type { EntitlementService } from '../entitlements/index.ts';
import { DomainError } from '../errors.ts';
import {
	accessRevokedEmail,
	orderConfirmationEmail,
	welcomeEmail,
	type EmailContent
} from '../marketing/index.ts';
import type { Order, OrderItem, OrderService } from './orders.ts';

const { orders, order_items, profiles, users, webhook_events } = schema;

const PROVIDER = 'stripe';

/**
 * How long a `webhook_events` row with neither `processed_at` nor `error` is
 * taken to be in another invocation's hands. Longer than any webhook function
 * may run (its `maxDuration`), so a row older than this was abandoned.
 */
export const IN_FLIGHT_WINDOW_MS = 2 * 60 * 1000;

export type FulfilOrderResult =
	{ alreadyFulfilled: true } | { fulfilled: true; firstFulfilment: boolean };

export interface FulfilOrderOptions {
	/**
	 * Runs inside the fulfilment transaction, after the grant and before the
	 * commit, with the result the call will return. The admin service writes
	 * its `audit_log` row here so the rerun and its audit commit together.
	 */
	inTransaction?: (tx: Tx, result: FulfilOrderResult) => Promise<void>;
}

export type RevocationKind = 'refund' | 'partial_refund' | 'dispute';

export interface RevokeOrderInput {
	kind: RevocationKind;
	/** Pence refunded so far (cumulative, as Stripe reports it); defaults to the order total. */
	amountRefunded?: number;
}

export interface RevokeOrderResult {
	status: Order['status'];
	/** How many entitlements this call revoked (0 when an earlier event already did). */
	revoked: number;
}

export type HandleEventResult =
	| { duplicate: true }
	| { duplicate: false; processed: true }
	| { duplicate: false; processed: false; error: string };

export interface FulfilmentService {
	/**
	 * The only place that grants `source = 'purchase'` entitlements. Locks the
	 * order row, checks the session against it and grants once; a second call
	 * for a fulfilled order returns `{ alreadyFulfilled: true }` and writes
	 * nothing. Throws `FULFILMENT_MISMATCH` (nothing written) when the session
	 * is unpaid or does not match the order's reference, total or currency.
	 * Emails go out after commit; their failures are logged, never thrown.
	 */
	fulfilOrder(
		orderId: string,
		session: CheckoutSessionView,
		options?: FulfilOrderOptions
	): Promise<FulfilOrderResult>;
	/**
	 * Revokes every entitlement the order granted and records the refund or
	 * dispute. Business rule: a partial refund still removes all access; the
	 * refunded amount is spread over the items pro rata to their price.
	 */
	revokeOrder(orderId: string, input: RevokeOrderInput): Promise<RevokeOrderResult>;
	/**
	 * Records the event in `webhook_events` before anything else (a repeated
	 * delivery is a no-op), dispatches by type and marks the row processed or
	 * failed. An unknown order is recorded as the row's `error` and returned
	 * normally; any other failure is recorded and rethrown so the caller can
	 * ask the provider to retry.
	 */
	handleGatewayEvent(event: GatewayEvent): Promise<HandleEventResult>;
}

export interface CreateFulfilmentServiceDeps {
	db: Db;
	orders: OrderService;
	entitlements: EntitlementService;
	auth: AuthService;
	mailer: Mailer;
	log: Logger;
	/** Origin for links in emails, without a trailing slash. */
	siteUrl: string;
	now?: () => Date;
}

/** An order the buyer has paid for at some point, whatever happened since. */
const FULFILLED_STATUSES: ReadonlySet<Order['status']> = new Set([
	'paid',
	'refunded',
	'partially_refunded',
	'disputed'
]);

/**
 * Spreads `amount` over the items in proportion to their price, in whole
 * pence, giving any rounding remainder to the last item so the parts add up.
 */
export function proRata(items: Pick<OrderItem, 'unit_price'>[], amount: number): number[] {
	const total = items.reduce((sum, item) => sum + item.unit_price, 0);
	if (items.length === 0) return [];
	if (total === 0) return items.map(() => 0);
	const shares = items.map((item) => Math.floor((item.unit_price * amount) / total));
	const allocated = shares.reduce((sum, share) => sum + share, 0);
	shares[shares.length - 1] += amount - allocated;
	return shares;
}

export function createFulfilmentService({
	db,
	orders: orderService,
	entitlements,
	auth,
	mailer,
	log,
	siteUrl,
	now = () => new Date()
}: CreateFulfilmentServiceDeps): FulfilmentService {
	const origin = siteUrl.replace(/\/$/, '');

	/** The order row under a row lock (`SELECT … FOR UPDATE`) with its items. */
	async function lockOrder(tx: Tx, orderId: string): Promise<Order & { items: OrderItem[] }> {
		const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
		if (!order) throw new DomainError('ORDER_NOT_FOUND', `Order ${orderId} not found`);
		const items = await tx.select().from(order_items).where(eq(order_items.order_id, orderId));
		return { ...order, items };
	}

	async function recipient(
		executor: Db | Tx,
		userId: string
	): Promise<{ email: string; name: string } | null> {
		const [row] = await executor
			.select({ email: users.email, name: profiles.full_name })
			.from(users)
			.innerJoin(profiles, eq(profiles.id, users.id))
			.where(eq(users.id, userId))
			.limit(1);
		return row ? { email: row.email, name: row.name ?? '' } : null;
	}

	async function deliver(to: string, content: EmailContent, what: string, orderId: string) {
		try {
			await mailer.send({ to, ...content });
		} catch (err) {
			log.error(`${what} email failed`, {
				orderId,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}

	function checkSession(order: Order, session: CheckoutSessionView): void {
		const problems: string[] = [];
		if (session.paymentStatus !== 'paid') problems.push(`payment_status ${session.paymentStatus}`);
		if (session.clientReferenceId !== order.id) problems.push('client_reference_id');
		if (session.amountTotal !== order.total) problems.push('amount_total');
		if ((session.currency ?? '').toLowerCase() !== order.currency.toLowerCase()) {
			problems.push('currency');
		}
		if (problems.length > 0) {
			throw new DomainError(
				'FULFILMENT_MISMATCH',
				`Session ${session.id} does not match order ${order.id}: ${problems.join(', ')}`
			);
		}
	}

	async function fulfilOrder(
		orderId: string,
		session: CheckoutSessionView,
		options: FulfilOrderOptions = {}
	): Promise<FulfilOrderResult> {
		type Granted = {
			order: Order & { items: OrderItem[] };
			to: { email: string; name: string } | null;
			firstFulfilment: boolean;
		};
		const outcome = await withTx(db, async (tx): Promise<Granted | { alreadyFulfilled: true }> => {
			const order = await lockOrder(tx, orderId);
			if (FULFILLED_STATUSES.has(order.status)) {
				await options.inTransaction?.(tx, { alreadyFulfilled: true });
				return { alreadyFulfilled: true };
			}
			checkSession(order, session);

			const [earlier] = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(orders)
				.where(
					and(eq(orders.user_id, order.user_id), isNotNull(orders.paid_at), ne(orders.id, order.id))
				);
			const firstFulfilment = earlier.count === 0;

			await tx
				.update(orders)
				.set({
					status: 'paid',
					paid_at: now().toISOString(),
					stripe_payment_intent_id: session.paymentIntentId
				})
				.where(eq(orders.id, order.id));
			if (session.customerId) {
				await tx
					.update(profiles)
					.set({ stripe_customer_id: session.customerId })
					.where(eq(profiles.id, order.user_id));
			}
			for (const item of order.items) {
				await entitlements.grant({
					userId: order.user_id,
					productId: item.product_id,
					source: 'purchase',
					orderItemId: item.id,
					tx
				});
			}

			const to = await recipient(tx, order.user_id);
			if (to && session.customerEmail?.toLowerCase() === to.email.toLowerCase()) {
				await auth.markEmailVerified(order.user_id, tx);
			}
			await options.inTransaction?.(tx, { fulfilled: true, firstFulfilment });
			return { order, to, firstFulfilment };
		});
		if ('alreadyFulfilled' in outcome) return outcome;

		const { order, to, firstFulfilment } = outcome;
		log.info('order fulfilled', { orderId: order.id, items: order.items.length, firstFulfilment });
		if (to) {
			await deliver(
				to.email,
				orderConfirmationEmail(
					{
						name: to.name,
						items: order.items.map((item) => ({
							title: item.product_title,
							pricePence: item.unit_price
						})),
						totalPence: order.total,
						discountPence: order.discount_total,
						libraryUrl: `${origin}/library`
					},
					origin
				),
				'order confirmation',
				order.id
			);
			if (firstFulfilment) {
				await deliver(to.email, welcomeEmail(to.name, origin), 'welcome', order.id);
			}
		}
		return { fulfilled: true, firstFulfilment };
	}

	async function revokeOrder(orderId: string, input: RevokeOrderInput): Promise<RevokeOrderResult> {
		const status: Order['status'] =
			input.kind === 'refund'
				? 'refunded'
				: input.kind === 'partial_refund'
					? 'partially_refunded'
					: 'disputed';

		const outcome = await withTx(db, async (tx) => {
			const order = await lockOrder(tx, orderId);
			const revoked = await entitlements.revokeByOrderItems(
				order.items.map((item) => item.id),
				input.kind,
				tx
			);
			await tx.update(orders).set({ status }).where(eq(orders.id, order.id));
			if (input.kind !== 'dispute') {
				const shares = proRata(order.items, input.amountRefunded ?? order.total);
				for (const [index, item] of order.items.entries()) {
					await tx
						.update(order_items)
						.set({ refunded_amount: shares[index] })
						.where(eq(order_items.id, item.id));
				}
			}
			return { order, revoked: revoked.length, to: await recipient(tx, order.user_id) };
		});

		log.info('order access revoked', {
			orderId,
			kind: input.kind,
			revoked: outcome.revoked
		});
		if (outcome.to) {
			await deliver(
				outcome.to.email,
				accessRevokedEmail({ name: outcome.to.name, orderRef: outcome.order.id }, origin),
				'access revoked',
				orderId
			);
		}
		return { status, revoked: outcome.revoked };
	}

	/** The order a payment intent paid for; null when none was fulfilled with it. */
	async function orderIdByPaymentIntent(paymentIntentId: string | null): Promise<string | null> {
		if (!paymentIntentId) return null;
		const [row] = await db
			.select({ id: orders.id })
			.from(orders)
			.where(eq(orders.stripe_payment_intent_id, paymentIntentId))
			.limit(1);
		return row?.id ?? null;
	}

	/**
	 * Runs the event's effect. Resolves to an error string for an order the
	 * event cannot be matched to; throws for anything that should be retried.
	 */
	async function dispatch(event: GatewayEvent): Promise<string | null> {
		switch (event.type) {
			case 'checkout.session.completed':
			case 'checkout.session.async_payment_succeeded':
			case 'checkout.session.async_payment_failed':
			case 'checkout.session.expired': {
				const session = event.data;
				const orderId = session.clientReferenceId ?? session.metadata.order_id ?? null;
				const order = orderId ? await orderService.getById(orderId) : null;
				if (!order || !orderId) return `order not found for session ${session.id}`;
				if (event.type === 'checkout.session.completed' && session.paymentStatus !== 'paid') {
					// A delayed payment method: `async_payment_succeeded` will follow.
					return null;
				}
				if (
					event.type === 'checkout.session.completed' ||
					event.type === 'checkout.session.async_payment_succeeded'
				) {
					await fulfilOrder(orderId, session);
				} else {
					await orderService.expire(orderId);
				}
				return null;
			}
			case 'charge.refunded': {
				const orderId = await orderIdByPaymentIntent(event.data.paymentIntentId);
				if (!orderId) return `order not found for charge ${event.data.chargeId}`;
				const full = event.data.amountRefunded >= event.data.amount;
				await revokeOrder(orderId, {
					kind: full ? 'refund' : 'partial_refund',
					amountRefunded: event.data.amountRefunded
				});
				return null;
			}
			case 'charge.dispute.created': {
				const orderId = await orderIdByPaymentIntent(event.data.paymentIntentId);
				if (!orderId) return `order not found for dispute ${event.data.disputeId}`;
				await revokeOrder(orderId, { kind: 'dispute' });
				return null;
			}
			case 'ignored':
				return null;
		}
	}

	/** The Stripe object an event is about, so the admin can list an order's deliveries. */
	function eventReference(event: GatewayEvent): string | null {
		switch (event.type) {
			case 'charge.refunded':
			case 'charge.dispute.created':
				return event.data.paymentIntentId;
			case 'ignored':
				return null;
			default:
				return event.data.id;
		}
	}

	async function handleGatewayEvent(event: GatewayEvent): Promise<HandleEventResult> {
		const type = event.type === 'ignored' ? event.data.stripeType : event.type;
		const [inserted] = await db
			.insert(webhook_events)
			.values({ provider: PROVIDER, event_id: event.id, type, reference: eventReference(event) })
			.onConflictDoNothing()
			.returning({ id: webhook_events.id });

		let rowId = inserted?.id;
		if (!rowId) {
			// Seen before. A processed row makes this delivery a no-op, as does one
			// received moments ago that another invocation is still handling. One
			// that failed is the provider's retry; so is one that was never marked
			// processed or failed (the process died after the insert), once it is
			// older than any handler could still be running.
			const [existing] = await db
				.select({
					id: webhook_events.id,
					receivedAt: webhook_events.received_at,
					processedAt: webhook_events.processed_at,
					error: webhook_events.error
				})
				.from(webhook_events)
				.where(and(eq(webhook_events.provider, PROVIDER), eq(webhook_events.event_id, event.id)))
				.limit(1);
			const inFlight =
				existing?.error === null &&
				now().getTime() - Date.parse(existing.receivedAt) < IN_FLIGHT_WINDOW_MS;
			if (!existing || existing.processedAt !== null || inFlight) {
				log.info('webhook event duplicate', { eventId: event.id, type });
				return { duplicate: true };
			}
			rowId = existing.id;
			if (existing.error === null) {
				log.warn('webhook event abandoned by an earlier delivery, retrying', {
					eventId: event.id,
					type
				});
			}
			await db.update(webhook_events).set({ error: null }).where(eq(webhook_events.id, rowId));
		}

		try {
			const problem = await dispatch(event);
			await db
				.update(webhook_events)
				.set(problem ? { error: problem } : { processed_at: now().toISOString() })
				.where(eq(webhook_events.id, rowId));
			if (problem) {
				log.warn('webhook event unmatched', { eventId: event.id, type, error: problem });
				return { duplicate: false, processed: false, error: problem };
			}
			return { duplicate: false, processed: true };
		} catch (err) {
			const message =
				err instanceof DomainError
					? `${err.code}: ${err.message}`
					: err instanceof Error
						? err.message
						: String(err);
			await db.update(webhook_events).set({ error: message }).where(eq(webhook_events.id, rowId));
			log.error('webhook event failed', { eventId: event.id, type, error: message });
			throw err;
		}
	}

	return { fulfilOrder, revokeOrder, handleGatewayEvent };
}
