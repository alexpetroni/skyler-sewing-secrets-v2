import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { createFakePaymentGateway } from './fakes/payment-gateway.ts';
import {
	createStripeGateway,
	type CheckoutSessionInput,
	type StripeClient,
	type StripeEventLike,
	type StripeSessionLike
} from './stripe.ts';

const ORDER_ID = '7d0c8a52-9b0e-4c1f-a8f4-0f2a6c1b9e11';

function input(overrides: Partial<CheckoutSessionInput> = {}): CheckoutSessionInput {
	return {
		orderId: ORDER_ID,
		customerEmail: 'buyer@example.com',
		lineItems: [
			{
				name: 'Chanel Skirt',
				description: 'Promo SPRING20 applied',
				unitAmount: 3920,
				quantity: 1
			},
			{ name: 'Pressing Seams', unitAmount: 900, quantity: 2 }
		],
		successUrl: 'https://skylersewingsecrets.com/checkout/success?order=' + ORDER_ID,
		cancelUrl: 'https://skylersewingsecrets.com/cart',
		expiresAt: new Date('2026-10-18T10:00:00.000Z'),
		metadata: { promo_code: 'SPRING20' },
		...overrides
	};
}

const sessionFixture: StripeSessionLike = {
	id: 'cs_test_123',
	url: 'https://checkout.stripe.com/c/pay/cs_test_123',
	payment_status: 'paid',
	status: 'complete',
	amount_total: 5720,
	currency: 'gbp',
	customer_email: 'buyer@example.com',
	customer_details: { email: 'Buyer@Example.com' },
	payment_intent: { id: 'pi_123' },
	customer: 'cus_123',
	metadata: { order_id: ORDER_ID },
	client_reference_id: ORDER_ID
};

/** A stand-in for the Stripe SDK that records every call. */
function stubClient(event?: StripeEventLike) {
	const calls = {
		create: [] as Array<{
			params: Stripe.Checkout.SessionCreateParams;
			options: Stripe.RequestOptions;
		}>,
		retrieve: [] as string[],
		refunds: [] as Stripe.RefundCreateParams[],
		webhooks: [] as Array<{ payload: string; header: string; secret: string }>
	};
	const client: StripeClient = {
		checkout: {
			sessions: {
				create: async (params, options) => {
					calls.create.push({ params, options });
					return sessionFixture;
				},
				retrieve: async (id) => {
					calls.retrieve.push(id);
					return sessionFixture;
				}
			}
		},
		refunds: {
			create: async (params) => {
				calls.refunds.push(params);
				return { id: 're_123' };
			}
		},
		webhooks: {
			constructEventAsync: async (payload, header, secret) => {
				calls.webhooks.push({ payload, header, secret });
				if (header !== 'valid-signature') throw new Error('No signatures found matching');
				if (!event) throw new Error('stubClient: no event configured');
				return event;
			}
		}
	};
	return { client, calls };
}

const gatewayOptions = { secretKey: 'sk_test_x', webhookSecret: 'whsec_x' };

describe('createStripeGateway: input → Stripe params mapping', () => {
	it('creates a payment-mode session carrying the order id everywhere Stripe needs it', async () => {
		const { client, calls } = stubClient();
		const result = await createStripeGateway(gatewayOptions, client).createCheckoutSession(input());

		expect(result).toEqual({
			id: 'cs_test_123',
			url: 'https://checkout.stripe.com/c/pay/cs_test_123'
		});
		expect(calls.create).toHaveLength(1);
		const { params, options } = calls.create[0];

		expect(params).toEqual({
			mode: 'payment',
			client_reference_id: ORDER_ID,
			customer_email: 'buyer@example.com',
			customer_creation: 'always',
			invoice_creation: { enabled: true },
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: 'gbp',
						unit_amount: 3920,
						product_data: { name: 'Chanel Skirt', description: 'Promo SPRING20 applied' }
					}
				},
				{
					quantity: 2,
					price_data: {
						currency: 'gbp',
						unit_amount: 900,
						product_data: { name: 'Pressing Seams' }
					}
				}
			],
			metadata: { promo_code: 'SPRING20', order_id: ORDER_ID },
			success_url: input().successUrl,
			cancel_url: 'https://skylersewingsecrets.com/cart',
			expires_at: Math.floor(new Date('2026-10-18T10:00:00.000Z').getTime() / 1000)
		});
		expect(params).not.toHaveProperty('payment_method_types');
		expect(options).toEqual({ idempotencyKey: ORDER_ID });
	});

	it('metadata.order_id cannot be overridden by caller metadata', async () => {
		const { client, calls } = stubClient();
		await createStripeGateway(gatewayOptions, client).createCheckoutSession(
			input({ metadata: { order_id: 'spoofed' } })
		);
		expect(calls.create[0].params.metadata).toEqual({ order_id: ORDER_ID });
	});

	it('normalises a retrieved session', async () => {
		const { client, calls } = stubClient();
		const view = await createStripeGateway(gatewayOptions, client).retrieveCheckoutSession(
			'cs_test_123'
		);
		expect(calls.retrieve).toEqual(['cs_test_123']);
		expect(view).toEqual({
			id: 'cs_test_123',
			url: 'https://checkout.stripe.com/c/pay/cs_test_123',
			paymentStatus: 'paid',
			status: 'complete',
			amountTotal: 5720,
			currency: 'gbp',
			customerEmail: 'Buyer@Example.com',
			paymentIntentId: 'pi_123',
			customerId: 'cus_123',
			metadata: { order_id: ORDER_ID },
			clientReferenceId: ORDER_ID
		});
	});

	it('verifies webhooks with constructEventAsync and the webhook secret', async () => {
		const event: StripeEventLike = {
			id: 'evt_1',
			type: 'checkout.session.completed',
			data: { object: sessionFixture }
		};
		const { client, calls } = stubClient(event);
		const gateway = createStripeGateway(gatewayOptions, client);

		const result = await gateway.constructEvent('{"raw":true}', 'valid-signature');
		expect(calls.webhooks).toEqual([
			{ payload: '{"raw":true}', header: 'valid-signature', secret: 'whsec_x' }
		]);
		expect(result.type).toBe('checkout.session.completed');
		expect(result.id).toBe('evt_1');

		await expect(gateway.constructEvent('{"raw":true}', 'forged')).rejects.toThrow(
			/No signatures found/
		);
	});

	it('maps refunds to payment_intent, with an optional partial amount', async () => {
		const { client, calls } = stubClient();
		const gateway = createStripeGateway(gatewayOptions, client);
		expect(await gateway.createRefund('pi_123')).toEqual({ id: 're_123' });
		await gateway.createRefund('pi_123', 1500);
		expect(calls.refunds).toEqual([
			{ payment_intent: 'pi_123' },
			{ payment_intent: 'pi_123', amount: 1500 }
		]);
	});
});

describe('createFakePaymentGateway', () => {
	it('create → markPaid → retrieve shows paid', async () => {
		const fake = createFakePaymentGateway();
		const { id, url } = await fake.createCheckoutSession(input());
		expect(url).toBe('https://fake.stripe/' + id);

		const before = await fake.retrieveCheckoutSession(id);
		expect(before).toMatchObject({
			paymentStatus: 'unpaid',
			status: 'open',
			amountTotal: 3920 + 900 * 2,
			currency: 'gbp',
			clientReferenceId: ORDER_ID,
			metadata: { order_id: ORDER_ID, promo_code: 'SPRING20' },
			paymentIntentId: null
		});

		fake.markPaid(id);
		const after = await fake.retrieveCheckoutSession(id);
		expect(after.paymentStatus).toBe('paid');
		expect(after.status).toBe('complete');
		expect(after.paymentIntentId).toMatch(/^pi_fake_/);
		expect(after.customerId).toMatch(/^cus_fake_/);
		expect(after.customerEmail).toBe('buyer@example.com');
	});

	it('markPaid applies overrides', async () => {
		const fake = createFakePaymentGateway();
		const { id } = await fake.createCheckoutSession(input());
		const view = fake.markPaid(id, { amountTotal: 100, customerEmail: 'other@example.com' });
		expect(view).toMatchObject({ paymentStatus: 'paid', amountTotal: 100 });
		expect((await fake.retrieveCheckoutSession(id)).customerEmail).toBe('other@example.com');
	});

	it('returns the same session for a repeated order id (idempotency key)', async () => {
		const fake = createFakePaymentGateway();
		const first = await fake.createCheckoutSession(input());
		const second = await fake.createCheckoutSession(input());
		expect(second).toEqual(first);
		expect(fake.sessions.size).toBe(1);
	});

	it('constructEvent rejects malformed JSON and non-event bodies', async () => {
		const fake = createFakePaymentGateway();
		await expect(fake.constructEvent('{not json', 'sig')).rejects.toThrow(SyntaxError);
		await expect(fake.constructEvent('{"id":"evt_1"}', 'sig')).rejects.toThrow(/not an event/);
	});

	it('eventsFromSession builds a checkout event with the fields the webhook needs', async () => {
		const fake = createFakePaymentGateway();
		const { id } = await fake.createCheckoutSession(input());
		fake.markPaid(id);

		const raw = JSON.parse(fake.eventsFromSession(id, 'checkout.session.completed')) as {
			object: string;
			data: { object: { object: string } };
		};
		expect(raw.object).toBe('event');
		expect(raw.data.object.object).toBe('checkout.session');

		const event = await fake.constructEvent(
			fake.eventsFromSession(id, 'checkout.session.completed'),
			'unchecked'
		);
		expect(event.id).toMatch(/^evt_fake_/);
		if (event.type !== 'checkout.session.completed') throw new Error(`unexpected ${event.type}`);
		expect(event.data).toMatchObject({
			id,
			paymentStatus: 'paid',
			status: 'complete',
			clientReferenceId: ORDER_ID,
			metadata: { order_id: ORDER_ID },
			amountTotal: 5720,
			currency: 'gbp',
			customerEmail: 'buyer@example.com'
		});
		expect(event.data.paymentIntentId).toMatch(/^pi_fake_/);
	});

	it('each event has a distinct id so webhook deduplication can be exercised', async () => {
		const fake = createFakePaymentGateway();
		const { id } = await fake.createCheckoutSession(input());
		const a = await fake.constructEvent(fake.eventsFromSession(id, 'checkout.session.expired'), '');
		const b = await fake.constructEvent(fake.eventsFromSession(id, 'checkout.session.expired'), '');
		expect(a.type).toBe('checkout.session.expired');
		expect(a.id).not.toBe(b.id);
	});

	it('eventsFromSession builds charge.refunded and charge.dispute.created from the payment intent', async () => {
		const fake = createFakePaymentGateway();
		const { id } = await fake.createCheckoutSession(input());
		const { paymentIntentId } = fake.markPaid(id);

		const refunded = await fake.constructEvent(fake.eventsFromSession(id, 'charge.refunded'), '');
		if (refunded.type !== 'charge.refunded') throw new Error(`unexpected ${refunded.type}`);
		expect(refunded.data).toMatchObject({
			paymentIntentId,
			amount: 5720,
			amountRefunded: 5720,
			refunded: true,
			currency: 'gbp'
		});
		expect(refunded.data.chargeId).toMatch(/^ch_fake_/);

		const dispute = await fake.constructEvent(
			fake.eventsFromSession(id, 'charge.dispute.created'),
			''
		);
		if (dispute.type !== 'charge.dispute.created') throw new Error(`unexpected ${dispute.type}`);
		expect(dispute.data).toMatchObject({ paymentIntentId, amount: 5720 });
		expect(dispute.data.chargeId).toMatch(/^ch_fake_/);
	});

	it('treats a payment status Stripe adds later as unpaid', async () => {
		const fake = createFakePaymentGateway();
		const event = await fake.constructEvent(
			JSON.stringify({
				id: 'evt_y',
				type: 'checkout.session.completed',
				data: { object: { ...sessionFixture, payment_status: 'pending_review', status: 'new' } }
			}),
			''
		);
		if (event.type !== 'checkout.session.completed') throw new Error(`unexpected ${event.type}`);
		expect(event.data.paymentStatus).toBe('unpaid');
		expect(event.data.status).toBeNull();
	});

	it('maps event types it does not handle to ignored', async () => {
		const fake = createFakePaymentGateway();
		const event = await fake.constructEvent(
			JSON.stringify({ id: 'evt_x', type: 'customer.created', data: { object: {} } }),
			''
		);
		expect(event).toEqual({
			id: 'evt_x',
			type: 'ignored',
			data: { stripeType: 'customer.created' }
		});
	});

	it('records refunds', async () => {
		const fake = createFakePaymentGateway();
		const refund = await fake.createRefund('pi_fake_1', 500);
		expect(fake.refunds).toEqual([
			{ id: refund.id, paymentIntentId: 'pi_fake_1', amountPence: 500 }
		]);
	});
});
