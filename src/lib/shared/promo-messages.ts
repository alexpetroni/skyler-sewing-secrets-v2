/**
 * What the buyer reads when a code is refused (docs/analysis/05-discounts.md →
 * Buyer UX). Specific about the rule that failed, never about whether other
 * codes exist: a malformed code reads exactly like an unknown one.
 */
export type PromoRejectionReason =
	| 'not_found'
	| 'inactive'
	| 'not_started'
	| 'expired'
	| 'cap_reached'
	| 'user_cap_reached'
	| 'not_eligible'
	| 'below_minimum';

export const PROMO_REJECTION_MESSAGES: Record<PromoRejectionReason, string> = {
	not_found: "We don't recognise that code. Check the spelling and try again.",
	inactive: 'This code is no longer active.',
	not_started: "This code isn't active yet.",
	expired: 'This code has expired.',
	cap_reached: 'This code has been fully redeemed.',
	user_cap_reached: 'Already used on this account.',
	not_eligible: "This code doesn't apply to anything in your cart.",
	below_minimum: "Your cart doesn't reach this code's minimum spend yet."
};

export function promoRejectionMessage(reason: PromoRejectionReason): string {
	return PROMO_REJECTION_MESSAGES[reason];
}
