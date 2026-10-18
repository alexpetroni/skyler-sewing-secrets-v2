import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html.ts';

// Ported from legacy/src/lib/server/email.test.ts.
describe('escapeHtml', () => {
	it('escapes &, <, >, " and \'', () => {
		expect(escapeHtml('a & b < c > d "e" \'f\'')).toBe(
			'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;'
		);
	});

	it('leaves other text unchanged', () => {
		expect(escapeHtml('Hello, world 123 / ? =')).toBe('Hello, world 123 / ? =');
	});
});
