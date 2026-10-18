import { describe, expect, it } from 'vitest';
import { contactNotificationEmail, escapeHtml } from './email';

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

describe('contactNotificationEmail', () => {
	it('escapes user-supplied HTML in the html body', () => {
		const { html } = contactNotificationEmail('<b>x</b>', 'a@b.c', null, '<script>');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
	});
});
