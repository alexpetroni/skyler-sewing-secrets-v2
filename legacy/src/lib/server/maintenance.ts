import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { site_settings } from '$lib/server/db/schema';

/**
 * Site-wide maintenance mode, driven by `site_settings.maintenance_mode`
 * (`'true'` / `'false'`). The hook reads it for every non-exempt request from
 * a non-admin; there is deliberately no cache, so an admin's toggle takes
 * effect immediately.
 */
export async function isMaintenanceMode(): Promise<boolean> {
	try {
		const [row] = await db
			.select({ value: site_settings.value })
			.from(site_settings)
			.where(eq(site_settings.key, 'maintenance_mode'))
			.limit(1);

		return row?.value === 'true';
	} catch (err) {
		// Fail open: if the database is down the admin cannot turn the flag off
		// either, and a broken site must not lock visitors out on top of it.
		console.error('[maintenance] failed to read maintenance_mode', err);
		return false;
	}
}

/**
 * Paths that keep working during maintenance. `/api/progress` and
 * `/api/newsletter` are deliberately not exempt: maintenance freezes member
 * and visitor writes.
 */
export const MAINTENANCE_EXEMPT_PREFIXES = [
	'/admin', // admins must reach the panel to turn maintenance off
	'/auth/', // sign-in, sign-out and OAuth must work so admins can get in
	'/api/auth/', // Better Auth endpoints live here
	'/api/stripe/', // the Stripe webhook must be accepted
	'/api/health', // the health check must answer
	'/checkout/success', // buyers returning from Stripe must be provisioned
	'/checkout/cancel' // Stripe's cancel_url: a buyer backing out must not land on the maintenance page
];

/** True when `pathname` starts with one of the exempt prefixes. */
export function isMaintenanceExempt(pathname: string): boolean {
	return MAINTENANCE_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
