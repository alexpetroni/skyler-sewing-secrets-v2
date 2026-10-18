// Backfill CLI: turns legacy rows into v2 rows (see src/lib/server/db/backfill).
//
//   npm run backfill -- --step all            run every step in order
//   npm run backfill -- --step orders         run one step
//   npm run backfill -- --step all --dry-run  run inside a transaction, roll back, print counts
//
// Reads DATABASE_URL and DATABASE_DRIVER from the environment: this is a CLI,
// the one place outside src/env.ts allowed to touch process.env.
import { parseArgs } from 'node:util';
import { createDb, withTx, type Db } from '#lib/server/db/index.ts';
import {
	BACKFILL_STEPS,
	isBackfillStep,
	runAll,
	runStep,
	type BackfillResult
} from '#lib/server/db/backfill/index.ts';

const HELP = `Usage: npm run backfill -- --step <${BACKFILL_STEPS.join('|')}|all> [--dry-run]

Options:
  --step <name>  which step to run, or "all" for every step in dependency order
  --dry-run      run inside a transaction and roll it back, printing the counts
  --help         show this text

Environment: DATABASE_URL (required), DATABASE_DRIVER (neon | pglite, defaults from the URL)`;

class DryRunRollback extends Error {
	constructor() {
		super('dry run: rolling back');
	}
}

function printSummary(result: BackfillResult, dryRun: boolean): void {
	const rows: Array<[string, string, string]> = [];
	for (const [step, counts] of Object.entries(result)) {
		for (const [metric, value] of Object.entries(counts)) {
			rows.push([step, metric, String(value)]);
		}
	}
	const widths = [0, 1, 2].map((i) => Math.max('step'.length, ...rows.map((r) => r[i].length)));
	const line = (cells: [string, string, string]) =>
		cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ');
	console.log(dryRun ? 'Dry run (rolled back):' : 'Backfill applied:');
	console.log(line(['step', 'metric', 'value']));
	console.log(widths.map((w) => '-'.repeat(w)).join('  '));
	for (const row of rows) console.log(line(row));
}

async function closeDb(db: Db): Promise<void> {
	// Neon's Pool (`end`) and PGlite (`close`) both hang off `$client`; the
	// shared `Db` type hides it, so narrow structurally.
	const client = (
		db as unknown as { $client?: { end?: () => Promise<void>; close?: () => Promise<void> } }
	).$client;
	if (client?.end) await client.end();
	else if (client?.close) await client.close();
}

async function main(argv: string[]): Promise<number> {
	const { values } = parseArgs({
		args: argv,
		options: {
			step: { type: 'string' },
			'dry-run': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false }
		},
		strict: true
	});

	if (values.help) {
		console.log(HELP);
		return 0;
	}
	const step = values.step;
	if (!step || (step !== 'all' && !isBackfillStep(step))) {
		console.error(`--step must be one of: ${BACKFILL_STEPS.join(', ')}, all\n`);
		console.error(HELP);
		return 2;
	}
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL is not set');
		return 2;
	}
	const driverValue = process.env.DATABASE_DRIVER;
	const driver = driverValue === 'neon' || driverValue === 'pglite' ? driverValue : undefined;
	const dryRun = values['dry-run'];

	const db = await createDb({ url, driver });
	try {
		const run = (handle: Db) => (step === 'all' ? runAll(handle) : runStep(handle, step));
		let result: BackfillResult | undefined;
		if (dryRun) {
			try {
				await withTx(db, async (tx) => {
					result = await run(tx);
					throw new DryRunRollback();
				});
			} catch (error) {
				if (!(error instanceof DryRunRollback)) throw error;
			}
		} else {
			result = await run(db);
		}
		if (result) printSummary(result, dryRun);
		return 0;
	} finally {
		await closeDb(db);
	}
}

main(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		// Drizzle reports `Failed query: …` with the Postgres error as `cause`.
		console.error(error instanceof Error ? error.message : String(error));
		if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message);
		process.exitCode = 1;
	}
);
