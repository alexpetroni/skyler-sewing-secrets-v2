import {
	CURRENCY,
	normaliseEvent,
	normaliseSession,
	type CheckoutSessionInput,
	type CheckoutSessionView,
	type HandledEventType,
	type PaymentGateway,
	type StripeEventLike,
	type StripeSessionLike
} from '../stripe.ts';

export interface FakeCheckoutSession {
	input: CheckoutSessionInput;
	session: StripeSessionLike;
}

export interface FakeRefund {
	id: string;
	paymentIntentId: string;
	amountPence?: number;
}

export interface FakePaymentGateway extends PaymentGateway {
	/** Sessions keyed by id, holding the input they were created from. */
	readonly sessions: Map<string, FakeCheckoutSession>;
	readonly refunds: FakeRefund[];
	/** Simulates a completed payment: `paid`, `complete`, with payment intent and customer ids. */
	markPaid(id: string, overrides?: Partial<CheckoutSessionView>): CheckoutSessionView;
	/**
	 * The raw webhook body Stripe would send for this session: the session
	 * itself for `checkout.session.*`, or a charge / dispute built from its
	 * payment intent for `charge.refunded` / `charge.dispute.created`.
	 */
	eventsFromSession(id: string, type: HandledEventType): string;
}

function toStripeOverrides(overrides: Partial<CheckoutSessionView>): Partial<StripeSessionLike> {
	const out: Partial<StripeSessionLike> = {};
	if (overrides.paymentStatus !== undefined) out.payment_status = overrides.paymentStatus;
	if (overrides.status !== undefined) out.status = overrides.status;
	if (overrides.amountTotal !== undefined) out.amount_total = overrides.amountTotal;
	if (overrides.currency !== undefined) out.currency = overrides.currency;
	if (overrides.customerEmail !== undefined) {
		out.customer_details = { email: overrides.customerEmail };
	}
	if (overrides.paymentIntentId !== undefined) out.payment_intent = overrides.paymentIntentId;
	if (overrides.customerId !== undefined) out.customer = overrides.customerId;
	if (overrides.metadata !== undefined) out.metadata = overrides.metadata;
	if (overrides.clientReferenceId !== undefined) {
		out.client_reference_id = overrides.clientReferenceId;
	}
	return out;
}

function isEventEnvelope(value: unknown): value is StripeEventLike {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === 'string' &&
		typeof record.type === 'string' &&
		typeof record.data === 'object' &&
		record.data !== null &&
		'object' in record.data
	);
}

/**
 * In-memory Stripe. Session ids are deterministic (`cs_test_fake_0001`, …),
 * a repeated `orderId` returns the same session (as Stripe's idempotency key
 * does), and `constructEvent` parses JSON without any signature check.
 */
export function createFakePaymentGateway(): FakePaymentGateway {
	const sessions = new Map<string, FakeCheckoutSession>();
	const refunds: FakeRefund[] = [];
	const byOrderId = new Map<string, string>();
	let counter = 0;
	const next = () => String(++counter).padStart(4, '0');

	const find = (id: string): FakeCheckoutSession => {
		const stored = sessions.get(id);
		if (!stored) throw new Error(`fake Stripe: no checkout session ${id}`);
		return stored;
	};

	const envelope = (type: string, object: unknown) => ({
		id: `evt_fake_${next()}`,
		object: 'event',
		api_version: '2026-09-30.endive',
		created: Math.floor(Date.now() / 1000),
		livemode: false,
		type,
		data: { object }
	});

	return {
		sessions,
		refunds,

		async createCheckoutSession(input) {
			const existing = byOrderId.get(input.orderId);
			if (existing) return { id: existing, url: `https://fake.stripe/${existing}` };

			const id = `cs_test_fake_${next()}`;
			const session: StripeSessionLike = {
				id,
				url: `https://fake.stripe/${id}`,
				payment_status: 'unpaid',
				status: 'open',
				amount_total: input.lineItems.reduce(
					(sum, item) => sum + item.unitAmount * item.quantity,
					0
				),
				currency: CURRENCY,
				customer_email: input.customerEmail,
				customer_details: null,
				payment_intent: null,
				customer: null,
				metadata: { ...input.metadata, order_id: input.orderId },
				client_reference_id: input.orderId
			};
			sessions.set(id, { input, session });
			byOrderId.set(input.orderId, id);
			return { id, url: `https://fake.stripe/${id}` };
		},

		async retrieveCheckoutSession(id) {
			return normaliseSession(find(id).session);
		},

		async constructEvent(rawBody) {
			const parsed: unknown = JSON.parse(rawBody);
			if (!isEventEnvelope(parsed)) throw new Error('fake Stripe: body is not an event');
			return normaliseEvent(parsed);
		},

		async createRefund(paymentIntentId, amountPence) {
			const refund: FakeRefund = { id: `re_fake_${next()}`, paymentIntentId, amountPence };
			refunds.push(refund);
			return { id: refund.id };
		},

		markPaid(id, overrides = {}) {
			const stored = find(id);
			const suffix = next();
			stored.session = {
				...stored.session,
				payment_status: 'paid',
				status: 'complete',
				payment_intent: `pi_fake_${suffix}`,
				customer: `cus_fake_${suffix}`,
				customer_details: { email: stored.input.customerEmail },
				...toStripeOverrides(overrides)
			};
			return normaliseSession(stored.session);
		},

		eventsFromSession(id, type) {
			const { session } = find(id);
			if (type === 'charge.refunded' || type === 'charge.dispute.created') {
				const amount = session.amount_total ?? 0;
				const chargeId = `ch_fake_${next()}`;
				const object =
					type === 'charge.refunded'
						? {
								id: chargeId,
								object: 'charge',
								payment_intent: session.payment_intent,
								amount,
								amount_refunded: amount,
								refunded: true,
								currency: session.currency
							}
						: {
								id: `dp_fake_${next()}`,
								object: 'dispute',
								charge: chargeId,
								payment_intent: session.payment_intent,
								amount,
								reason: 'fraudulent',
								status: 'needs_response'
							};
				return JSON.stringify(envelope(type, object));
			}
			return JSON.stringify(envelope(type, { object: 'checkout.session', ...session }));
		}
	};
}
