import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const SPECS = [
	'admin-bundle.spec.ts',
	'buy-bundle-with-code.spec.ts',
	'buy-single.spec.ts',
	'locked-lesson.spec.ts',
	'member-course.spec.ts',
	'refund-revokes.spec.ts'
];

describe('the Playwright suite', () => {
	it('parses with `playwright test --list` and lists the six spec files', () => {
		// Listing loads the config and every spec without launching a browser.
		// execFileSync throws on a non-zero exit, failing the test.
		const output = execFileSync('npx', ['playwright', 'test', '--list'], {
			encoding: 'utf8',
			env: { PATH: process.env.PATH, HOME: process.env.HOME }
		});
		const files = new Set([...output.matchAll(/› (\S+\.spec\.ts):\d+:\d+ ›/g)].map((m) => m[1]));
		expect([...files].sort()).toEqual(SPECS);
		expect(output).toMatch(/Total: \d+ tests in 6 files/);
	}, 60_000);
});
