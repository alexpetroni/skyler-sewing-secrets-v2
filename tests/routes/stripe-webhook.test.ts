import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import type { OrderWithItems } from '../../src/lib/server/modules/commerce/index.ts';
import { POST } from '../../src/routes/api/webhooks/stripe/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import type { TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { orders, webhook_events } = schema;

type PostEvent = Parameters<typeof POST>[0];

describe('POST /api/webhooks/stripe', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let order: OrderWithItems;
	let sessionId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		const buyer = seeded.users.nobody;
		const { orders: orderService } = seeded.services.commerce;
		order = await orderService.createPendingOrder({
			userId: buyer.id,
			state: { items: [seeded.bundle.id], promoCode: null },
			viewer: { id: buyer.id }
		});
		await orderService.startCheckout(order.id, { customerEmail: buyer.email });
		sessionId = (await orderService.getById(order.id))?.stripe_checkout_session_id ?? '';
		expect(sessionId).toMatch(/^cs_test_fake_/);
	});

	async function post(body: string, services: TestServices = seeded.services) {
		const event = fakeEvent({
			method: 'POST',
			url: '/api/webhooks/stripe',
			headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=sig' },
			body,
			locals: { services, requestId: 'req-1' }
		});
		const response = await POST(event as unknown as PostEvent);
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	}

	const paidCompletedEvent = () => {
		seeded.services.payments.markPaid(sessionId);
		return seeded.services.payments.eventsFromSession(sessionId, 'checkout.session.completed');
	};

	it('answers 400 when the signature does not verify and records nothing', async () => {
		const rejecting: TestServices = {
			...seeded.services,
			payments: {
				...seeded.services.payments,
				constructEvent: async () => {
					throw new Error('No signatures found matching the expected signature for payload');
				}
			}
		};
		const result = await post(paidCompletedEvent(), rejecting);

		expect(result).toEqual({ status: 400, body: { error: 'Invalid signature' } });
		expect(await db().select().from(webhook_events)).toEqual([]);
		expect((await db().select().from(orders).where(eq(orders.id, order.id)))[0].status).toBe(
			'pending'
		);
	});

	it('fulfils the order on a verified checkout.session.completed and answers 200', async () => {
		const body = paidCompletedEvent();
		const result = await post(body);

		expect(result).toEqual({ status: 200, body: { received: true } });
		expect((await db().select().from(orders).where(eq(orders.id, order.id)))[0].status).toBe(
			'paid'
		);
		expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual([
			seeded.bundle.id
		]);
		const [row] = await db().select().from(webhook_events);
		expect(row).toMatchObject({ provider: 'stripe', type: 'checkout.session.completed' });
		expect(row.processed_at).not.toBeNull();

		// A redelivery is acknowledged without granting again.
		expect(await post(body)).toEqual({ status: 200, body: { received: true } });
		expect(await seeded.services.entitlements.ownedProductIds(seeded.users.nobody.id)).toEqual([
			seeded.bundle.id
		]);

		const logged = JSON.stringify(seeded.services.logEntries);
		expect(logged).toContain('stripe webhook handled');
		expect(logged).not.toContain(seeded.users.nobody.email);
		expect(logged).not.toContain('@example.com');
	});

	it('answers 500 when the handler throws so Stripe retries', async () => {
		const failing: TestServices = {
			...seeded.services,
			commerce: {
				...seeded.services.commerce,
				fulfilment: {
					...seeded.services.commerce.fulfilment,
					handleGatewayEvent: async () => {
						throw new Error('database unavailable');
					}
				}
			}
		};
		const result = await post(paidCompletedEvent(), failing);

		expect(result).toEqual({ status: 500, body: { error: 'Webhook handling failed' } });
		const failure = seeded.services.logEntries.find((entry) => entry.level === 'error');
		expect(failure?.message).toBe('stripe webhook failed');
		expect(failure?.fields).toMatchObject({ type: 'checkout.session.completed' });
	});

	it('answers 500 and keeps the order pending when fulfilment refuses the session', async () => {
		seeded.services.payments.markPaid(sessionId, { amountTotal: order.total + 1 });
		const body = seeded.services.payments.eventsFromSession(
			sessionId,
			'checkout.session.completed'
		);
		expect((await post(body)).status).toBe(500);
		expect((await db().select().from(orders).where(eq(orders.id, order.id)))[0].status).toBe(
			'pending'
		);
		const [row] = await db().select().from(webhook_events);
		expect(row.error).toContain('FULFILMENT_MISMATCH');
	});
});
