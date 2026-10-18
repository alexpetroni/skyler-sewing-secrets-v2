import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { site_settings } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const [maintenanceSetting] = await db
		.select({ value: site_settings.value, updated_at: site_settings.updated_at })
		.from(site_settings)
		.where(eq(site_settings.key, 'maintenance_mode'))
		.limit(1);

	return {
		maintenanceMode: maintenanceSetting?.value === 'true',
		maintenanceUpdatedAt: maintenanceSetting?.updated_at || null
	};
};

export const actions: Actions = {
	toggleMaintenance: async () => {
		try {
			const [current] = await db
				.select({ value: site_settings.value })
				.from(site_settings)
				.where(eq(site_settings.key, 'maintenance_mode'))
				.limit(1);

			const newValue = current?.value === 'true' ? 'false' : 'true';

			await db
				.update(site_settings)
				.set({ value: newValue, updated_at: new Date().toISOString() })
				.where(eq(site_settings.key, 'maintenance_mode'));
		} catch (error) {
			console.error('Failed to update maintenance mode:', error);
			return fail(500, { error: 'Failed to update maintenance mode' });
		}

		return { success: true };
	}
};
