import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
	if (!_stripe) {
		if (!env.STRIPE_SECRET_KEY) {
			throw new Error('STRIPE_SECRET_KEY environment variable is not set');
		}
		_stripe = new Stripe(env.STRIPE_SECRET_KEY);
	}
	return _stripe;
}

// Legacy export for backwards compatibility - use getStripe() instead
export const stripe = {
	get checkout() { return getStripe().checkout; },
	get customers() { return getStripe().customers; },
	get paymentIntents() { return getStripe().paymentIntents; },
	get webhooks() { return getStripe().webhooks; }
} as unknown as Stripe;

/**
 * Calculate final price after applying promo code
 */
export function calculateDiscount(
	basePrice: number,
	discountType: 'percentage' | 'fixed',
	discountValue: number
): { discount: number; finalPrice: number } {
	let discount = 0;
	
	if (discountType === 'percentage') {
		discount = Math.round(basePrice * (discountValue / 100));
	} else {
		discount = discountValue;
	}

	// Ensure discount doesn't exceed base price
	discount = Math.min(discount, basePrice);
	
	return {
		discount,
		finalPrice: basePrice - discount
	};
}

/**
 * Format price from pence to display string
 */
export function formatPrice(amountInPence: number, currency = 'gbp'): string {
	return new Intl.NumberFormat('en-GB', {
		style: 'currency',
		currency: currency.toUpperCase()
	}).format(amountInPence / 100);
}
