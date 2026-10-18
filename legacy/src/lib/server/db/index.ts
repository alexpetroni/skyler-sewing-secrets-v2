import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

export type Database = NeonHttpDatabase<typeof schema>;

let _db: Database | null = null;

/**
 * Lazily create the Drizzle client over Neon's HTTP driver.
 * Lazy so that importing this module never requires DATABASE_URL
 * at build time (same pattern as getStripe()).
 */
export function getDb(): Database {
	if (!_db) {
		if (!env.DATABASE_URL) {
			throw new Error('DATABASE_URL environment variable is not set');
		}
		_db = drizzle(neon(env.DATABASE_URL), { schema });
	}
	return _db;
}

export const db: Database = new Proxy({} as Database, {
	get(_target, prop) {
		const instance = getDb();
		const value = instance[prop as keyof Database];
		return typeof value === 'function' ? (value as CallableFunction).bind(instance) : value;
	}
});
