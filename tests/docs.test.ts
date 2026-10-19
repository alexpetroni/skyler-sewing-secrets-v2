import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DOCS = [
	'docs/ARCHITECTURE.md',
	'docs/runbooks/backfill.md',
	'docs/runbooks/launch.md',
	'docs/runbooks/operations.md',
	'docs/runbooks/retire-legacy.sql'
];

/** Every file under `dir`, recursively, as paths relative to the project root. */
function filesUnder(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? filesUnder(path) : [path];
	});
}

describe('launch documentation', () => {
	it.each(DOCS)('%s exists and is not empty', (path) => {
		expect(existsSync(path)).toBe(true);
		expect(readFileSync(path, 'utf8').trim().length).toBeGreaterThan(500);
	});

	it('keeps retire-legacy.sql out of the migrations: nothing under drizzle/ references it', () => {
		const files = filesUnder('drizzle');
		expect(files.length).toBeGreaterThan(0);
		const referencing = files.filter((file) =>
			readFileSync(file, 'utf8').includes('retire-legacy')
		);
		expect(referencing).toEqual([]);
	});

	it('retire-legacy.sql drops exactly the legacy tables and columns', () => {
		const sql = readFileSync('docs/runbooks/retire-legacy.sql', 'utf8');
		const drops = [
			...sql.matchAll(
				/^(DROP TABLE IF EXISTS (\w+)|ALTER TABLE (\w+) DROP COLUMN IF EXISTS (\w+));$/gm
			)
		]
			.map((m) => (m[2] ? m[2] : `${m[3]}.${m[4]}`))
			.sort();
		expect(drops).toEqual(
			[
				'pricing_config',
				'payments',
				'profiles.email',
				'profiles.is_member',
				'lessons.video_url',
				'lessons.lesson_type',
				'lessons.content',
				'lessons.duration_minutes',
				'promo_codes.max_uses',
				'promo_codes.current_uses',
				'promo_codes.valid_from',
				'promo_codes.valid_until',
				'promo_codes.min_purchase_amount'
			].sort()
		);
	});
});

describe('test hygiene', () => {
	const sources = [...filesUnder('src'), ...filesUnder('tests'), ...filesUnder('scripts')].filter(
		(file) => /\.(ts|svelte)$/.test(file)
	);

	it('has no skipped, focused or todo tests outside tests/e2e', () => {
		const offenders = sources
			.filter((file) => !file.startsWith(join('tests', 'e2e')))
			.filter((file) => /\b(it|test|describe)\.(skip|only|todo)/.test(readFileSync(file, 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('gives every skip in tests/e2e a condition and a reason', () => {
		const specs = filesUnder(join('tests', 'e2e')).filter((file) => file.endsWith('.ts'));
		const skips = specs.flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(/test\.skip\(([^)]*)\)/g)].map((m) => m[1])
		);
		expect(skips.length).toBeGreaterThan(0);
		for (const args of skips) expect(args).toMatch(/^!process\.env\.E2E_\w+, '[^']+'$/);
	});

	it('documents every E2E_* variable the suite reads in tests/e2e/.env.example', () => {
		const read = new Set(
			[...filesUnder(join('tests', 'e2e')), 'playwright.config.ts']
				.filter((file) => file.endsWith('.ts'))
				.flatMap((file) =>
					[...readFileSync(file, 'utf8').matchAll(/\bE2E_[A-Z_]+\b/g)].map((m) => m[0])
				)
		);
		const documented = new Set(
			[...readFileSync('tests/e2e/.env.example', 'utf8').matchAll(/^(E2E_[A-Z_]+)=/gm)].map(
				(m) => m[1]
			)
		);
		expect(read.size).toBeGreaterThan(0);
		expect([...read].sort()).toEqual([...documented].sort());
	});
});
