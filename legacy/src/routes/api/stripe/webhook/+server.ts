import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, sql } from 'drizzle-orm';
import { stripe } from '$lib/server/stripe';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { profiles } from '$lib/server/db/schema';
import { recordPaidCheckout } from '$lib/server/membership';
import { getAuth } from '$lib/server/auth';
import { createCredentialUser, ensureProfile, findUserIdByEmail } from '$lib/server/users';
import { sendEmail, welcomeEmail, purchaseConfirmationEmail } from '$lib/server/email';
import type Stripe from 'stripe';

export const POST: RequestHandler = async ({ request }) => {
	console.log('[webhook] POST received');

	const body = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature || !env.STRIPE_WEBHOOK_SECRET) {
		console.error('[webhook] Missing signature or webhook secret', {
			hasSignature: !!signature,
			hasWebhookSecret: !!env.STRIPE_WEBHOOK_SECRET
		});
		return json({ error: 'Missing signature or webhook secret' }, { status: 400 });
	}

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET!);
	} catch (err) {
		console.error('[webhook] Signature verification failed:', err);
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	console.log('[webhook] Event verified:', event.type, event.id);

	try {
		switch (event.type) {
			case 'checkout.session.completed': {
				const session = event.data.object as Stripe.Checkout.Session;
				console.log('[webhook] checkout.session.completed:', {
					sessionId: session.id,
					email: session.customer_details?.email || session.customer_email,
					paymentStatus: session.payment_status,
					metadata: session.metadata
				});

				await handleCheckoutComplete(session);
				break;
			}

			case 'payment_intent.payment_failed': {
				const paymentIntent = event.data.object as Stripe.PaymentIntent;
				console.error('[webhook] Payment failed:', paymentIntent.id);
				break;
			}
		}
	} catch (err) {
		console.error('[webhook] Error handling event:', err);
		return json({ error: 'Internal error' }, { status: 500 });
	}

	return json({ received: true });
};

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
	if (session.payment_status !== 'paid') {
		console.log('[webhook] Ignoring checkout.session.completed with payment_status:', session.payment_status);
		return;
	}

	const customerEmail = session.customer_details?.email || session.customer_email;
	const metadata = session.metadata || {};
	const promoCodeId = metadata.promo_code_id;
	// Accounts are created at checkout time (metadata.user_id). full_name is
	// only present on sessions created before that change.
	const fullName = metadata.full_name || session.customer_details?.name || '';

	let userId: string | undefined = metadata.user_id || undefined;

	// No user_id on the session: find the account by the paid email
	if (!userId && customerEmail) {
		const [existingProfile] = await db
			.select({ id: profiles.id })
			.from(profiles)
			.where(sql`lower(${profiles.email}) = lower(${customerEmail})`)
			.limit(1);

		userId = existingProfile?.id ?? (await findUserIdByEmail(customerEmail)) ?? undefined;
	}

	// Last resort: neither metadata.user_id nor the paid email resolves to an
	// account (a session created before accounts were made at checkout, or a
	// lost account). Create it with a random password and send a set-password
	// email so the buyer has a way in.
	if (!userId && customerEmail) {
		const randomPassword = crypto.randomUUID() + 'A1!';

		try {
			userId = await createCredentialUser({
				email: customerEmail,
				password: randomPassword,
				fullName
			});

			// Better Auth mints the token and sends via the Resend template
			try {
				await getAuth().api.requestPasswordReset({
					body: { email: customerEmail, redirectTo: '/auth/reset-password' }
				});
			} catch (resetError) {
				console.error('[webhook] Failed to send set-password email:', resetError);
			}
		} catch (createError) {
			// User already created (e.g. by a concurrent delivery of this event)
			console.error('[webhook] Error creating user:', createError);
			userId = (await findUserIdByEmail(customerEmail)) ?? undefined;
		}
	}

	// Ensure profile exists (defensive)
	if (userId && customerEmail) {
		await ensureProfile({ userId, email: customerEmail, fullName });
	}

	if (!userId) {
		console.error('[webhook] No user ID found for checkout session:', session.id);
		return;
	}

	// Only ever grant the admin flag here, never revoke it — a buyer who is
	// already an admin must not lose the flag just because they also bought
	// the course, and only the configured ADMIN_EMAIL should ever gain it.
	const grantAdmin =
		!!env.ADMIN_EMAIL && customerEmail?.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

	// Records the payment (idempotent on stripe_checkout_session_id) and grants
	// membership only to the account the session was recorded for. A payment
	// insert error propagates to the POST handler so it returns 500 and Stripe
	// retries this event instead of silently losing the payment record.
	const { granted, firstRecording } = await recordPaidCheckout({
		userId,
		session,
		promoCodeId: promoCodeId || null,
		grantAdmin,
		log: '[webhook]'
	});

	if (!granted) {
		console.error('[webhook] Membership not granted — session belongs to another account:', session.id);
		return;
	}

	// Only send emails on the first recording (avoids double-email when both
	// the webhook and the success page run)
	if (!firstRecording) {
		return;
	}

	// Get user name for emails
	const [profile] = await db
		.select({ full_name: profiles.full_name, email: profiles.email })
		.from(profiles)
		.where(eq(profiles.id, userId))
		.limit(1);

	const userName = profile?.full_name || 'there';
	const userEmail = profile?.email || customerEmail;

	if (userEmail) {
		// Format amount for email (convert from pence)
		const amountFormatted = new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency: session.currency || 'gbp'
		}).format((session.amount_total || 0) / 100);

		// Send welcome email
		const welcome = welcomeEmail(userName);
		await sendEmail({
			to: userEmail,
			subject: welcome.subject,
			html: welcome.html,
			text: welcome.text
		});

		// Send purchase confirmation email
		const confirmation = purchaseConfirmationEmail(userName, amountFormatted);
		await sendEmail({
			to: userEmail,
			subject: confirmation.subject,
			html: confirmation.html,
			text: confirmation.text
		});
	}
}
