import type { GatewayEvent } from '#lib/server/platform/index.ts';
import type { RequestHandler } from './$types';

/** Stripe retries for up to three days; a slow fulfilment must not be cut short. */
export const config = { maxDuration: 60 };

/**
 * Stripe webhook. The raw body is verified against the `stripe-signature`
 * header before anything is parsed; a bad signature is a 400 and never
 * retried. Handler failures are 500s so Stripe redelivers the event. Only
 * event ids and types are logged.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { payments, commerce } = locals.services;
	const log = locals.log;

	const rawBody = await request.text();
	const signature = request.headers.get('stripe-signature') ?? '';
	let event: GatewayEvent;
	try {
		event = await payments.constructEvent(rawBody, signature);
	} catch (err) {
		log.warn('stripe webhook rejected', {
			error: err instanceof Error ? err.message : String(err)
		});
		return Response.json({ error: 'Invalid signature' }, { status: 400 });
	}

	const type = event.type === 'ignored' ? event.data.stripeType : event.type;
	try {
		const result = await commerce.fulfilment.handleGatewayEvent(event);
		log.info('stripe webhook handled', { eventId: event.id, type, duplicate: result.duplicate });
		return Response.json({ received: true });
	} catch (err) {
		log.error('stripe webhook failed', {
			eventId: event.id,
			type,
			error: err instanceof Error ? err.message : String(err)
		});
		return Response.json({ error: 'Webhook handling failed' }, { status: 500 });
	}
};
