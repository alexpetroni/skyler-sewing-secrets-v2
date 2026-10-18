import { eq, sql } from 'drizzle-orm';
import { schema, withTx, type Db } from '#lib/server/db/index.ts';
import type { Logger } from '#lib/server/platform/index.ts';
import { writeAudit } from './audit.ts';

const { site_settings } = schema;

export const MAINTENANCE_KEY = 'maintenance_mode';
export const MAINTENANCE_CACHE_MS = 30_000;

export interface SettingsService {
	/** The stored value, or null when the key has never been set. */
	get(key: string): Promise<string | null>;
	/** Upserts the value and records it in `audit_log` in the same transaction. */
	set(key: string, value: string, actorId: string): Promise<void>;
	/**
	 * Whether `maintenance_mode` is `'true'`, cached per instance for
	 * `maintenanceCacheMs` so the hook does not query on every request.
	 * Fails open: if the database is down the admin cannot turn the flag off
	 * either, and a broken site must not lock visitors out on top of it.
	 */
	isMaintenanceMode(): Promise<boolean>;
}

export interface SettingsDeps {
	db: Db;
	log: Logger;
	now: () => Date;
	maintenanceCacheMs?: number;
}

export function createSettingsService(deps: SettingsDeps): SettingsService {
	const { db, log, now, maintenanceCacheMs = MAINTENANCE_CACHE_MS } = deps;
	let cached: { value: boolean; readAt: number } | undefined;

	async function get(key: string): Promise<string | null> {
		const [row] = await db
			.select({ value: site_settings.value })
			.from(site_settings)
			.where(eq(site_settings.key, key))
			.limit(1);
		return row?.value ?? null;
	}

	return {
		get,

		async set(key, value, actorId) {
			await withTx(db, async (tx) => {
				const [before] = await tx
					.select({ value: site_settings.value })
					.from(site_settings)
					.where(eq(site_settings.key, key))
					.limit(1);
				await tx
					.insert(site_settings)
					.values({ key, value })
					.onConflictDoUpdate({
						target: site_settings.key,
						set: { value, updated_at: sql`now()` }
					});
				await writeAudit(tx, {
					actorId,
					action: 'setting.update',
					entity: 'site_setting',
					entityId: key,
					before: before ? { value: before.value } : null,
					after: { value }
				});
			});
			// This instance sees its own toggle at once; others within the cache window.
			if (key === MAINTENANCE_KEY) cached = undefined;
			log.info('site setting updated', { key, actorId });
		},

		async isMaintenanceMode() {
			const at = now().getTime();
			if (cached && at - cached.readAt < maintenanceCacheMs) return cached.value;
			try {
				const value = (await get(MAINTENANCE_KEY)) === 'true';
				cached = { value, readAt: at };
				return value;
			} catch (err) {
				log.error('failed to read maintenance_mode', {
					error: err instanceof Error ? err.message : String(err)
				});
				return false;
			}
		}
	};
}
