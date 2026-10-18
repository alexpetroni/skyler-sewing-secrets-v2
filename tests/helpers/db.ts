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
	/** Empties every public table (except the migrations ledger) with CASCADE. */
	truncateAll(): Promise<void>;
}

/**
 * A fresh in-memory PGlite database with every migration under `drizzle/`
 * applied. One per test file; call `truncateAll()` between tests.
 */
export async function createTestDb(): Promise<TestDb> {
	const client = new PGlite();
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: './drizzle' });

	return {
		db,
		close: () => client.close(),
		truncateAll: async () => {
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
 * table truncated in `beforeEach`, the instance closed in `afterAll`. Read the
 * database through the returned getter inside tests, never at module scope.
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
