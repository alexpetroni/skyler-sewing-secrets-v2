import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDb, withTx, type Db } from '../../src/lib/server/db/index.ts';

describe('createDb + withTx on pglite://memory', () => {
	let db: Db;

	beforeAll(async () => {
		db = await createDb({ url: 'pglite://memory' });
		await db.execute(sql`CREATE TABLE tx_probe (id integer PRIMARY KEY, label text NOT NULL)`);
	});

	async function labels(): Promise<string[]> {
		const result = await db.execute<{ label: string }>(sql`SELECT label FROM tx_probe ORDER BY id`);
		return result.rows.map((row) => row.label);
	}

	it('rolls back every write when the callback throws', async () => {
		await expect(
			withTx(db, async (tx) => {
				await tx.execute(sql`INSERT INTO tx_probe (id, label) VALUES (1, 'rolled back')`);
				throw new Error('abort');
			})
		).rejects.toThrow('abort');

		expect(await labels()).toEqual([]);
	});

	it('commits and returns the callback result otherwise', async () => {
		const inserted = await withTx(db, async (tx) => {
			await tx.execute(sql`INSERT INTO tx_probe (id, label) VALUES (2, 'committed')`);
			const result = await tx.execute<{ id: number }>(
				sql`SELECT id FROM tx_probe WHERE label = 'committed'`
			);
			return result.rows[0]?.id;
		});

		expect(inserted).toBe(2);
		expect(await labels()).toEqual(['committed']);
	});

	it('selects the pglite driver from the URL scheme and exposes db.query', async () => {
		await db.execute(
			sql`CREATE TABLE site_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`
		);
		await db.execute(sql`INSERT INTO site_settings (key, value) VALUES ('k', 'v')`);
		const row = await db.query.site_settings.findFirst();
		expect(row).toMatchObject({ key: 'k', value: 'v' });
	});
});
