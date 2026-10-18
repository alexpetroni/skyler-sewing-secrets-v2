import { error, redirect } from '@sveltejs/kit';
import { clear } from '#lib/server/modules/commerce/index.ts';
import type { CheckoutSessionView } from '#lib/server/platform/index.ts';
import type { PageServerLoad } from './$types';

const OTHER_ACCOUNT =
	'This payment was made with a different email address. Sign in with that account to access it.';

/**
 * The page never trusts the URL beyond asking Stripe: the order comes from
 * the session's reference, and a signed-in viewer must be its buyer. A paid
 * session is fulfilled right here (idempotently, so the webhook racing it is
 * harmless); if that fails the page still renders the "finalising" state and
 * the webhook completes the order.
 */
export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const sessionId = url.searchParams.get('session_id');
	if (!sessionId) redirect(303, '/cart');

	const { payments, commerce, logger } = locals.services;
	let session: CheckoutSessionView;
	try {
		session = await payments.retrieveCheckoutSession(sessionId);
	} catch (err) {
		logger.warn('checkout session lookup failed', {
			requestId: locals.requestId,
			error: err instanceof Error ? err.message : String(err)
		});
		redirect(303, '/cart');
	}

	const referencedId = session.clientReferenceId ?? session.metadata.order_id ?? null;
	const order =
		(await commerce.orders.getByCheckoutSession(session.id)) ??
		(referencedId ? await commerce.orders.getById(referencedId) : null);
	if (!order) error(404, 'We could not find an order for this payment.');

	if (locals.user && !commerce.orders.ownerOf(order, { id: locals.user.id })) {
		error(403, OTHER_ACCOUNT);
	}

	const paid = session.paymentStatus === 'paid';
	let current = order;
	if (paid) {
		try {
			await commerce.fulfilment.fulfilOrder(order.id, session);
			current = (await commerce.orders.getById(order.id)) ?? order;
		} catch (err) {
			logger.error('fulfilment from success page failed', {
				requestId: locals.requestId,
				orderId: order.id,
				error: err instanceof Error ? err.message : String(err)
			});
		}
		// What was bought is no longer in the cart.
		commerce.cartCookie.write(cookies, clear());
	}

	return {
		summary: await commerce.orders.summaryForSuccessPage(current),
		paid,
		signedIn: locals.user !== null
	};
};
