import { eq, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type Stripe from 'stripe';
import { db } from '$lib/server/db';
import { payments, profiles } from '$lib/server/db/schema';

function getPaymentIntentId(paymentIntent: string | Stripe.PaymentIntent | null): string | null {
	if (typeof paymentIntent === 'string') return paymentIntent;
	if (paymentIntent?.id) return paymentIntent.id;
	return null;
}

export interface RecordPaidCheckoutOptions {
	userId: string;
	session: Stripe.Checkout.Session;
	promoCodeId: string | null;
	/** Webhook only: ADMIN_EMAIL matched the paid email. Grant, never revoke. */
	grantAdmin?: boolean;
	/** Log prefix — '[success]' or '[webhook]'. */
	log: string;
}

export interface RecordPaidCheckoutResult {
	/** Membership was granted (or re-confirmed) for `userId`. */
	granted: boolean;
	/** This call inserted the `payments` row, i.e. the session had never been recorded before. */
	firstRecording: boolean;
}

/**
 * Record a paid Stripe Checkout session and grant membership to the account
 * that owns it. Shared by the success page and the webhook so both apply the
 * same rules.
 *
 * Order of operations and the invariant each step protects:
 *
 * 1. Insert the `payments` row FIRST, with onConflictDoNothing on the UNIQUE
 *    `stripe_checkout_session_id`. This makes the payment row the single
 *    claim on the session: whoever inserts it owns the session. Insert errors
 *    propagate so the webhook returns 500 and Stripe retries.
 * 2. If nothing was inserted, the session was already recorded. Read the
 *    existing row's `user_id`; if it is not `userId`, return
 *    `{ granted: false }` WITHOUT touching `profiles`. A paid session grants
 *    membership to exactly one account, so a second account presenting the
 *    same session id gets nothing.
 * 3. Only then update `profiles`: `is_member`, `member_since` via coalesce so
 *    a revisit or retried delivery never resets an existing join date,
 *    `stripe_customer_id` when known, and `is_admin: true` only when the
 *    caller asked for it (the flag is never set to false here).
 * 4. Increment promo usage only on the first recording so the success page
 *    and the webhook cannot double-count the same session.
 */
export async function recordPaidCheckout(
	options: RecordPaidCheckoutOptions
): Promise<RecordPaidCheckoutResult> {
	const { userId, session, promoCodeId, grantAdmin = false, log } = options;

	// Step 1: claim the session. Errors propagate on purpose.
	const inserted = await db
		.insert(payments)
		.values({
			user_id: userId,
			stripe_checkout_session_id: session.id,
			stripe_payment_intent_id: getPaymentIntentId(session.payment_intent),
			amount: session.amount_total || 0,
			currency: session.currency || 'gbp',
			status: 'succeeded',
			promo_code_id: promoCodeId || null,
			discount_amount: session.total_details?.amount_discount || 0
		})
		.onConflictDoNothing()
		.returning({ id: payments.id, user_id: payments.user_id });

	const firstRecording = inserted.length > 0;

	// Step 2: on conflict, the session already belongs to someone — verify it is us.
	if (!firstRecording) {
		const [existing] = await db
			.select({ user_id: payments.user_id })
			.from(payments)
			.where(eq(payments.stripe_checkout_session_id, session.id))
			.limit(1);

		if (existing && existing.user_id !== userId) {
			console.error(`${log} checkout session already recorded for a different user`, {
				sessionId: session.id,
				recordedUserId: existing.user_id,
				requestedUserId: userId
			});
			return { granted: false, firstRecording: false };
		}
	}

	// Step 3: grant membership to the owning account.
	const profileUpdate: PgUpdateSetSource<typeof profiles> = {
		is_member: true,
		member_since: sql`coalesce(${profiles.member_since}, now())`
	};
	if (typeof session.customer === 'string') {
		profileUpdate.stripe_customer_id = session.customer;
	}
	// Only ever grant the admin flag, never revoke it.
	if (grantAdmin) {
		profileUpdate.is_admin = true;
	}
	await db.update(profiles).set(profileUpdate).where(eq(profiles.id, userId));

	// Step 4: promo usage counts once per session.
	if (firstRecording && promoCodeId) {
		try {
			await db.execute(sql`SELECT increment_promo_code_usage(${promoCodeId}::uuid)`);
		} catch (promoError) {
			console.error(`${log} Error incrementing promo usage:`, promoError);
		}
	}

	return { granted: true, firstRecording };
}
