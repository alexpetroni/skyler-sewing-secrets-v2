import Stripe from 'stripe';

/**
 * Stripe adapter. Services and webhooks depend on `PaymentGateway`; only this
 * file knows the Stripe SDK. Amounts are integer pence, currency GBP.
 */

export interface CheckoutLineItem {
	name: string;
	description?: string;
	/** Pence, already discounted. */
	unitAmount: number;
	quantity: number;
}

export interface CheckoutSessionInput {
	orderId: string;
	customerEmail: string;
	lineItems: CheckoutLineItem[];
	successUrl: string;
	cancelUrl: string;
	expiresAt: Date;
	/** Extra metadata; `order_id` is always set to `orderId`. */
	metadata?: Record<string, string>;
}

export type CheckoutPaymentStatus = 'paid' | 'unpaid' | 'no_payment_required';
export type CheckoutStatus = 'open' | 'complete' | 'expired';

export interface CheckoutSessionView {
	id: string;
	/** The hosted payment page; null once the session is complete or expired. */
	url: string | null;
	paymentStatus: CheckoutPaymentStatus;
	status: CheckoutStatus | null;
	amountTotal: number | null;
	currency: string | null;
	customerEmail: string | null;
	paymentIntentId: string | null;
	customerId: string | null;
	metadata: Record<string, string>;
	clientReferenceId: string | null;
}

export interface ChargeRefundedData {
	chargeId: string;
	paymentIntentId: string | null;
	amount: number;
	amountRefunded: number;
	/** True when the charge is fully refunded. */
	refunded: boolean;
	currency: string;
}

export interface DisputeCreatedData {
	disputeId: string;
	chargeId: string | null;
	paymentIntentId: string | null;
	amount: number;
	reason: string;
	status: string;
}

export type CheckoutEventType =
	| 'checkout.session.completed'
	| 'checkout.session.async_payment_succeeded'
	| 'checkout.session.async_payment_failed'
	| 'checkout.session.expired';

export type HandledEventType = CheckoutEventType | 'charge.refunded' | 'charge.dispute.created';

/**
 * A verified webhook event. Types we do not handle arrive as `ignored` with
 * the Stripe type kept for logging, so the webhook can still acknowledge and
 * deduplicate them by `id`.
 */
export type GatewayEvent =
	| { id: string; type: CheckoutEventType; data: CheckoutSessionView }
	| { id: string; type: 'charge.refunded'; data: ChargeRefundedData }
	| { id: string; type: 'charge.dispute.created'; data: DisputeCreatedData }
	| { id: string; type: 'ignored'; data: { stripeType: string } };

export interface PaymentGateway {
	createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
	retrieveCheckoutSession(id: string): Promise<CheckoutSessionView>;
	/** Throws when the signature does not verify or the body is not an event. */
	constructEvent(rawBody: string, signature: string): Promise<GatewayEvent>;
	createRefund(paymentIntentId: string, amountPence?: number): Promise<{ id: string }>;
}

export const CURRENCY = 'gbp';

type Expandable = string | { id: string } | null;

/** The fields of a Stripe Checkout Session this adapter reads. */
export interface StripeSessionLike {
	id: string;
	url?: string | null;
	/** Stripe types these as open string enums. */
	payment_status: string;
	status: string | null;
	amount_total: number | null;
	currency: string | null;
	customer_email: string | null;
	customer_details?: { email?: string | null } | null;
	payment_intent: Expandable;
	customer: Expandable;
	metadata: Record<string, string> | null;
	client_reference_id: string | null;
}

/** The fields of a Stripe Charge this adapter reads. */
export interface StripeChargeLike {
	id: string;
	payment_intent: Expandable;
	amount: number;
	amount_refunded: number;
	refunded: boolean;
	currency: string;
}

/** The fields of a Stripe Dispute this adapter reads. */
export interface StripeDisputeLike {
	id: string;
	charge: Expandable;
	payment_intent: Expandable;
	amount: number;
	reason: string;
	status: string;
}

/** The envelope of a Stripe event. */
export interface StripeEventLike {
	id: string;
	type: string;
	data: { object: unknown };
}

const idOf = (value: Expandable): string | null =>
	value === null ? null : typeof value === 'string' ? value : value.id;

/** A value Stripe adds later is treated as unpaid, so it can never fulfil an order. */
function toPaymentStatus(value: string): CheckoutPaymentStatus {
	return value === 'paid' || value === 'no_payment_required' ? value : 'unpaid';
}

function toCheckoutStatus(value: string | null): CheckoutStatus | null {
	return value === 'open' || value === 'complete' || value === 'expired' ? value : null;
}

export function normaliseSession(session: StripeSessionLike): CheckoutSessionView {
	return {
		id: session.id,
		url: session.url ?? null,
		paymentStatus: toPaymentStatus(session.payment_status),
		status: toCheckoutStatus(session.status),
		amountTotal: session.amount_total,
		currency: session.currency,
		customerEmail: session.customer_details?.email ?? session.customer_email,
		paymentIntentId: idOf(session.payment_intent),
		customerId: idOf(session.customer),
		metadata: session.metadata ?? {},
		clientReferenceId: session.client_reference_id
	};
}

const CHECKOUT_EVENT_TYPES: ReadonlySet<string> = new Set<CheckoutEventType>([
	'checkout.session.completed',
	'checkout.session.async_payment_succeeded',
	'checkout.session.async_payment_failed',
	'checkout.session.expired'
]);

function isCheckoutEventType(type: string): type is CheckoutEventType {
	return CHECKOUT_EVENT_TYPES.has(type);
}

/** Maps a verified Stripe event onto `GatewayEvent`; shared by the real gateway and the fake. */
export function normaliseEvent(event: StripeEventLike): GatewayEvent {
	const { id, type } = event;
	if (isCheckoutEventType(type)) {
		return { id, type, data: normaliseSession(event.data.object as StripeSessionLike) };
	}
	if (type === 'charge.refunded') {
		const charge = event.data.object as StripeChargeLike;
		return {
			id,
			type,
			data: {
				chargeId: charge.id,
				paymentIntentId: idOf(charge.payment_intent),
				amount: charge.amount,
				amountRefunded: charge.amount_refunded,
				refunded: charge.refunded,
				currency: charge.currency
			}
		};
	}
	if (type === 'charge.dispute.created') {
		const dispute = event.data.object as StripeDisputeLike;
		return {
			id,
			type,
			data: {
				disputeId: dispute.id,
				chargeId: idOf(dispute.charge),
				paymentIntentId: idOf(dispute.payment_intent),
				amount: dispute.amount,
				reason: dispute.reason,
				status: dispute.status
			}
		};
	}
	return { id, type: 'ignored', data: { stripeType: type } };
}

/** The Checkout Session create parameters and request options for an order. */
export function checkoutSessionParams(input: CheckoutSessionInput): {
	params: Stripe.Checkout.SessionCreateParams;
	options: Stripe.RequestOptions;
} {
	return {
		params: {
			mode: 'payment',
			client_reference_id: input.orderId,
			customer_email: input.customerEmail,
			customer_creation: 'always',
			invoice_creation: { enabled: true },
			line_items: input.lineItems.map((item) => ({
				quantity: item.quantity,
				price_data: {
					currency: CURRENCY,
					unit_amount: item.unitAmount,
					product_data: {
						name: item.name,
						...(item.description ? { description: item.description } : {})
					}
				}
			})),
			metadata: { ...input.metadata, order_id: input.orderId },
			success_url: input.successUrl,
			cancel_url: input.cancelUrl,
			expires_at: Math.floor(input.expiresAt.getTime() / 1000)
		},
		options: { idempotencyKey: input.orderId }
	};
}

/** The part of the Stripe SDK the gateway uses; a real `Stripe` instance satisfies it. */
export interface StripeClient {
	checkout: {
		sessions: {
			create(
				params: Stripe.Checkout.SessionCreateParams,
				options: Stripe.RequestOptions
			): Promise<StripeSessionLike>;
			retrieve(id: string): Promise<StripeSessionLike>;
		};
	};
	refunds: {
		create(params: Stripe.RefundCreateParams): Promise<{ id: string }>;
	};
	webhooks: {
		constructEventAsync(payload: string, header: string, secret: string): Promise<StripeEventLike>;
	};
}

export interface StripeGatewayOptions {
	secretKey: string;
	webhookSecret: string;
}

/** `client` is for tests: a stub standing in for the SDK. */
export function createStripeGateway(
	options: StripeGatewayOptions,
	client: StripeClient = new Stripe(options.secretKey)
): PaymentGateway {
	return {
		async createCheckoutSession(input) {
			const { params, options: requestOptions } = checkoutSessionParams(input);
			const session = await client.checkout.sessions.create(params, requestOptions);
			if (!session.url)
				throw new Error(`Stripe returned checkout session ${session.id} without a URL`);
			return { id: session.id, url: session.url };
		},

		async retrieveCheckoutSession(id) {
			return normaliseSession(await client.checkout.sessions.retrieve(id));
		},

		async constructEvent(rawBody, signature) {
			const event = await client.webhooks.constructEventAsync(
				rawBody,
				signature,
				options.webhookSecret
			);
			return normaliseEvent(event);
		},

		async createRefund(paymentIntentId, amountPence) {
			const refund = await client.refunds.create({
				payment_intent: paymentIntentId,
				...(amountPence === undefined ? {} : { amount: amountPence })
			});
			return { id: refund.id };
		}
	};
}
