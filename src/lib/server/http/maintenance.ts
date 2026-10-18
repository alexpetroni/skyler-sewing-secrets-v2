import { eq } from 'drizzle-orm';
import { schema, type Db } from '#lib/server/db/index.ts';
import type { Logger } from '#lib/server/platform/logger.ts';

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

export interface MaintenanceReader {
	/** Whether `site_settings.maintenance_mode` is `'true'`, cached for `ttlMs`. */
	isOn(): Promise<boolean>;
}

/**
 * Reads the maintenance flag with a short in-process cache (one per serverless
 * instance): an admin's toggle takes effect within `ttlMs` instead of costing
 * a query on every request. Fails open: if the database is down the admin
 * cannot turn the flag off either, and a broken site must not lock visitors
 * out on top of it.
 */
export function createMaintenanceReader(options: {
	db: Db;
	logger: Logger;
	ttlMs?: number;
	now?: () => number;
}): MaintenanceReader {
	const { db, logger, ttlMs = 30_000, now = Date.now } = options;
	let cached: { value: boolean; readAt: number } | undefined;

	return {
		async isOn() {
			if (cached && now() - cached.readAt < ttlMs) return cached.value;
			try {
				const [row] = await db
					.select({ value: schema.site_settings.value })
					.from(schema.site_settings)
					.where(eq(schema.site_settings.key, 'maintenance_mode'))
					.limit(1);
				cached = { value: row?.value === 'true', readAt: now() };
				return cached.value;
			} catch (err) {
				logger.error('failed to read maintenance_mode', { error: describeError(err) });
				return false;
			}
		}
	};
}

function describeError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
