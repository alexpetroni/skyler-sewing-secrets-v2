import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { stripe } from '$lib/server/stripe';
import { recordPaidCheckout } from '$lib/server/membership';
import { ensureProfile, findUserIdByEmail } from '$lib/server/users';

export const load: PageServerLoad = async ({ url, locals }) => {
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		redirect(303, '/checkout');
	}

	// Verify the Stripe session
	let stripeSession;
	try {
		stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
	} catch (err) {
		console.error('Error retrieving Stripe session:', err);
		redirect(303, '/checkout?error=invalid_session');
	}

	// Ids and statuses only: no email addresses in the logs
	console.log('[success] Processing payment session:', {
		sessionId,
		paymentStatus: stripeSession.payment_status,
		metadataUserId: stripeSession.metadata?.user_id,
		hasUser: !!locals.user
	});

	if (stripeSession.payment_status !== 'paid') {
		redirect(303, '/checkout?error=payment_incomplete');
	}

	const metadata = stripeSession.metadata || {};

	// The email that was actually charged for this session — the only source
	// of truth for which account this payment belongs to
	const paidEmail = stripeSession.customer_details?.email || stripeSession.customer_email || undefined;

	// If user is already authenticated, ensure profile + record membership
	if (locals.user) {
		console.log('[success] User already authenticated:', locals.user.id);

		// Ownership check BEFORE recording anything: a paid session grants
		// membership only to the account that made it. If the page recorded the
		// payment under the wrong user first, the webhook would later find a
		// foreign owner and the real buyer would get nothing.
		const owns = metadata.user_id
			? metadata.user_id === locals.user.id
			: paidEmail?.toLowerCase() === locals.user.email.toLowerCase();
		if (!owns) {
			console.error('[success] checkout session belongs to a different account', {
				sessionId,
				userId: locals.user.id
			});
			error(403, 'This payment was made with a different email address. Sign in with that account to access it.');
		}

		const userEmail = locals.user.email || paidEmail || '';
		await ensureProfile({ userId: locals.user.id, email: userEmail });
		try {
			await recordPaidCheckout({
				userId: locals.user.id,
				session: stripeSession,
				promoCodeId: metadata.promo_code_id || null,
				log: '[success]'
			});
		} catch (recordError) {
			console.error('[success] Error recording paid checkout:', recordError);
		}
		return { sessionId, success: true };
	}

	// Signed-out visitor (cookie-less browser, expired session). The account
	// was created at checkout time, so resolve it — never create one here; the
	// webhook is the creator of last resort for sessions that predate that.
	let userId: string | undefined = metadata.user_id || undefined;
	if (!userId && paidEmail) {
		userId = (await findUserIdByEmail(paidEmail)) ?? undefined;
	}

	if (!userId) {
		console.error('[success] No account found for checkout session:', sessionId);
		return { sessionId, success: true, needsSignIn: true, email: paidEmail };
	}

	console.log('[success] Recording membership for signed-out visitor:', userId);
	try {
		if (paidEmail) {
			await ensureProfile({ userId, email: paidEmail });
		}
		await recordPaidCheckout({
			userId,
			session: stripeSession,
			promoCodeId: metadata.promo_code_id || null,
			log: '[success]'
		});
	} catch (recordError) {
		console.error('[success] Error recording paid checkout:', recordError);
	}

	console.log('[success] Returning needsSignIn for user:', userId);
	return { sessionId, success: true, needsSignIn: true, email: paidEmail };
};
