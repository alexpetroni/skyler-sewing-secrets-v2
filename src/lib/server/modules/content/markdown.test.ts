import { describe, expect, it } from 'vitest';
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS, renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
	it('keeps headings, lists, emphasis, code and links', () => {
		const html = renderMarkdown(
			[
				'## Pressing seams',
				'',
				'Use **steam** and *patience*.',
				'',
				'- press open',
				'- press to one side',
				'',
				'1. first',
				'2. second',
				'',
				'See [the guide](https://example.com/guide "Guide") and `iron`.'
			].join('\n')
		);

		expect(html).toContain('<h2>Pressing seams</h2>');
		expect(html).toContain('<strong>steam</strong>');
		expect(html).toContain('<em>patience</em>');
		expect(html).toContain('<ul>\n<li>press open</li>\n<li>press to one side</li>\n</ul>');
		expect(html).toContain('<ol>\n<li>first</li>\n<li>second</li>\n</ol>');
		expect(html).toContain('<a href="https://example.com/guide" title="Guide">the guide</a>');
		expect(html).toContain('<code>iron</code>');
	});

	it('keeps GFM tables and https images', () => {
		const html = renderMarkdown(
			'| Fabric | Needle |\n| --- | --- |\n| Silk | 60 |\n\n![Hem](https://cdn.example.com/hem.jpg)'
		);

		expect(html).toContain('<table>');
		expect(html).toContain('<th>Fabric</th>');
		expect(html).toContain('<td>Silk</td>');
		expect(html).toContain('<img src="https://cdn.example.com/hem.jpg" alt="Hem" />');
	});

	it('removes <script> elements and their contents', () => {
		const html = renderMarkdown('Hello\n\n<script>alert("x")</script>\n\nafter');

		expect(html).not.toContain('<script');
		expect(html).not.toContain('alert');
		expect(html).toContain('<p>Hello</p>');
		expect(html).toContain('<p>after</p>');
	});

	it('removes onclick and other on* handlers', () => {
		const html = renderMarkdown(
			'<p onclick="steal()">tap</p>\n\n<img src="https://cdn.example.com/a.jpg" onerror="steal()">'
		);

		expect(html).not.toContain('onclick');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('steal');
		expect(html).toContain('<p>tap</p>');
		expect(html).toContain('<img src="https://cdn.example.com/a.jpg" />');
	});

	it('removes javascript: hrefs from Markdown and raw links', () => {
		const html = renderMarkdown(
			'[click](javascript:alert(1))\n\n<a href="JavaScript:alert(2)">raw</a>'
		);

		expect(html).not.toMatch(/javascript:/i);
		expect(html).toContain('<a>click</a>');
		expect(html).toContain('<a>raw</a>');
	});

	it('removes style attributes and <style> elements', () => {
		const html = renderMarkdown(
			'<p style="position:fixed">pinned</p>\n\n<style>body { display: none }</style>'
		);

		expect(html).not.toContain('style');
		expect(html).not.toContain('position');
		expect(html).not.toContain('display');
		expect(html.trim()).toBe('<p>pinned</p>');
	});

	it('removes <iframe> elements', () => {
		const html = renderMarkdown('<iframe src="https://evil.example.com"></iframe>\n\ntext');

		expect(html).not.toContain('iframe');
		expect(html).not.toContain('evil.example.com');
		expect(html).toContain('<p>text</p>');
	});

	it('drops images that are not served over https', () => {
		const html = renderMarkdown(
			'![a](http://cdn.example.com/a.jpg)\n\n<img src="data:image/png;base64,AAAA" alt="b">'
		);

		expect(html).not.toContain('http://cdn.example.com');
		expect(html).not.toContain('data:');
	});

	it('forces rel="noopener noreferrer" on target=_blank links', () => {
		const html = renderMarkdown(
			'<a href="https://example.com" target="_blank" rel="opener">out</a>'
		);

		expect(html).toBe(
			'<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">out</a></p>\n'
		);
	});

	it('keeps mailto links and leaves rel off same-tab links', () => {
		const html = renderMarkdown('[Email us](mailto:hello@example.com)');

		expect(html).toBe('<p><a href="mailto:hello@example.com">Email us</a></p>\n');
	});
});

describe('allow-list', () => {
	it('names exactly the tags the content spec allows', () => {
		expect([...ALLOWED_TAGS].sort()).toEqual(
			[
				'p',
				'h2',
				'h3',
				'h4',
				'ul',
				'ol',
				'li',
				'strong',
				'em',
				'a',
				'img',
				'blockquote',
				'code',
				'pre',
				'hr',
				'br',
				'table',
				'thead',
				'tbody',
				'tr',
				'th',
				'td',
				'figure',
				'figcaption'
			].sort()
		);
	});

	it('excludes script, iframe and style', () => {
		for (const tag of ['script', 'iframe', 'style']) {
			expect(ALLOWED_TAGS).not.toContain(tag);
		}
	});

	it('allows attributes only on links and images, never style or handlers', () => {
		expect(ALLOWED_ATTRIBUTES).toEqual({
			a: ['href', 'title', 'rel', 'target'],
			img: ['src', 'alt', 'width', 'height']
		});
	});
});
