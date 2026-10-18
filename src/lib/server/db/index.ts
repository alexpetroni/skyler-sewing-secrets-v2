import type { Assume, ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.ts';

export { schema };

/**
 * Shape of a raw `db.execute()` result shared by both drivers: Neon's
 * `QueryResult<Row>` and PGlite's `Results<Row>` both carry `rows`. The base
 * `PgQueryResultHKT` types the result as `unknown`, which would make every
 * `execute` caller cast.
 */
export interface DbQueryRows<Row> {
	rows: Row[];
}

export interface DbQueryResultHKT extends PgQueryResultHKT {
	type: DbQueryRows<Assume<this['row'], Record<string, unknown>>>;
}

/**
 * The one database type the whole server codebase depends on.
 *
 * Neon (`drizzle-orm/neon-serverless`) and PGlite (`drizzle-orm/pglite`) both
 * return subclasses of `PgDatabase` whose only difference is the driver's
 * query-result generic. Declaring `Db` against the `rows`-only result HKT
 * above is the narrowest supertype of both that still types `db.query.*`,
 * `db.select()/insert()/update()/delete()`, `db.execute()` and
 * `db.transaction()`. Services never see which driver is behind it.
 */
export type Db = PgDatabase<
	DbQueryResultHKT,
	typeof schema,
	ExtractTablesWithRelations<typeof schema>
>;

/** The transaction handle passed to `withTx` callbacks (same API as `Db`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type DbDriver = 'neon' | 'pglite';

export interface CreateDbOptions {
	/**
	 * `postgresql://…` for Neon, `pglite://memory` for an in-memory PGlite,
	 * `pglite://./path` for a PGlite data directory.
	 */
	url: string;
	/** Defaults from the URL scheme. */
	driver?: DbDriver;
}

const PGLITE_SCHEME = 'pglite://';

function driverFromUrl(url: string): DbDriver {
	return url.startsWith(PGLITE_SCHEME) ? 'pglite' : 'neon';
}

/**
 * Creates a Drizzle client. Reads no environment: the runtime container
 * passes the connection details in. Drivers are imported lazily so that the
 * production bundle only loads the one it uses.
 */
export async function createDb(options: CreateDbOptions): Promise<Db> {
	const driver = options.driver ?? driverFromUrl(options.url);

	if (driver === 'pglite') {
		const [{ PGlite }, { drizzle }] = await Promise.all([
			import('@electric-sql/pglite'),
			import('drizzle-orm/pglite')
		]);
		const dataDir = options.url.slice(PGLITE_SCHEME.length);
		const client = dataDir === 'memory' ? new PGlite() : new PGlite(dataDir);
		return drizzle(client, { schema });
	}

	const [{ Pool }, { drizzle }] = await Promise.all([
		import('@neondatabase/serverless'),
		import('drizzle-orm/neon-serverless')
	]);
	return drizzle(new Pool({ connectionString: options.url }), { schema });
}

/**
 * Runs `fn` inside one database transaction. A thrown error rolls everything
 * back and is rethrown; otherwise the transaction commits and the callback's
 * result is returned. Side effects (email, Stripe, Bunny) belong after the
 * returned promise resolves, never inside `fn`.
 */
export function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return db.transaction(fn);
}
