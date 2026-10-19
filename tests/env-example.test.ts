import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkEnv, compareEnv, declaredNames } from '../scripts/check-env.ts';

describe('.env.example', () => {
	it('documents exactly the variables src/env.ts declares', () => {
		expect(checkEnv()).toEqual({ missingFromExample: [], undeclared: [] });
	});

	it('finds the declared variables', () => {
		const names = declaredNames(readFileSync('src/env.ts', 'utf8'));
		expect(names).toContain('DATABASE_URL');
		expect(names).toContain('PUBLIC_SENTRY_DSN');
		expect(names.length).toBeGreaterThan(20);
	});

	it('reports a variable removed from .env.example, and one that is not declared', () => {
		const env = readFileSync('src/env.ts', 'utf8');
		const example = readFileSync('.env.example', 'utf8');

		const removed = compareEnv(env, example.replace(/^CRON_SECRET=.*$/m, ''));
		expect(removed.missingFromExample).toEqual(['CRON_SECRET']);

		const extra = compareEnv(env, `${example}\nSTALE_VARIABLE=1\n`);
		expect(extra.undeclared).toEqual(['STALE_VARIABLE']);
	});
});
