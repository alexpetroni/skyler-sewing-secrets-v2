/**
 * Paths that keep working during maintenance. Member and visitor writes
 * (progress, newsletter) are deliberately not exempt: maintenance freezes them.
 */
export const MAINTENANCE_EXEMPT_PREFIXES = [
	'/admin', // admins must reach the panel to turn maintenance off
	'/auth/', // sign-in, sign-out and OAuth must work so admins can get in
	'/api/auth/', // Better Auth endpoints live here
	'/api/stripe/', // legacy Stripe webhook path, still accepted
	'/api/webhooks/', // Stripe and Bunny webhooks must be accepted
	'/api/health', // the health check must answer
	'/checkout/success', // buyers returning from Stripe must be provisioned
	'/checkout/cancel' // Stripe's cancel_url: a buyer backing out must not land on the maintenance page
];

/** True when `pathname` starts with one of the exempt prefixes. */
export function isMaintenanceExempt(pathname: string): boolean {
	return MAINTENANCE_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
