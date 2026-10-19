import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { schema, type Db } from '../../src/lib/server/db/index.ts';

export interface TestDb {
	db: Db;
	/** Shuts the PGlite instance down. */
	close(): Promise<void>;
	/**
	 * Empties every public table with CASCADE. This also removes the rows seeded
	 * by `0001_triggers_functions_seed.sql` (the `pricing_config` default and
	 * `site_settings.maintenance_mode`), which production always has: a test
	 * that depends on them inserts them itself after truncation.
	 */
	truncateAll(): Promise<void>;
}

/**
 * A fresh in-memory PGlite database with every migration under `drizzle/`
 * applied. One per test file; call `truncateAll()` between tests.
 */
export async function createTestDb(): Promise<TestDb> {
	const client = new PGlite();
	// PGlite takes the host's timezone, so `timestamptz` columns read back as
	// `+02` on a Paris laptop and `+00` in CI. Neon sessions are UTC; match it so
	// the suite's string timestamps are the same everywhere.
	await client.exec("SET TIME ZONE 'UTC'");
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: './drizzle' });

	return {
		db,
		close: () => client.close(),
		truncateAll: async () => {
			// The migrations ledger lives in the `drizzle` schema, so the `public`
			// filter already excludes it; the name check guards a custom ledger location.
			const rows = await db.execute<{ table_name: string }>(sql`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = 'public'
					AND table_type = 'BASE TABLE'
					AND table_name <> '__drizzle_migrations'
			`);
			if (rows.rows.length === 0) return;
			const tables = sql.join(
				rows.rows.map((row) => sql.identifier(row.table_name)),
				sql`, `
			);
			await db.execute(sql`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
		}
	};
}

/**
 * Registers the per-file lifecycle: one PGlite created in `beforeAll`, every
 * table truncated in `beforeEach` (seed rows included, see `truncateAll`), the
 * instance closed in `afterAll`. Read the database through the returned getter
 * inside tests, never at module scope.
 *
 * @example
 * const { db } = useTestDb();
 * it('…', async () => { await db().insert(users).values(…); });
 */
export function useTestDb(): { db: () => Db; testDb: () => TestDb } {
	let current: TestDb | undefined;

	beforeAll(async () => {
		current = await createTestDb();
	});
	beforeEach(async () => {
		await current?.truncateAll();
	});
	afterAll(async () => {
		await current?.close();
		current = undefined;
	});

	const testDb = (): TestDb => {
		if (!current) throw new Error('useTestDb(): database is only available inside tests');
		return current;
	};
	return { db: () => testDb().db, testDb };
}
