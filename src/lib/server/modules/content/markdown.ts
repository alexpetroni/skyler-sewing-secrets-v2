import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * The only producer of `*_html` content columns (security audit M1).
 * Markdown is rendered with GFM, then every tag and attribute outside the
 * allow-list below is dropped, so raw HTML in the source (scripts, iframes,
 * inline styles, event handlers) never reaches a `{@html}` block.
 */

export const ALLOWED_TAGS: readonly string[] = [
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
];

export const ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
	a: ['href', 'title', 'rel', 'target'],
	img: ['src', 'alt', 'width', 'height']
};

export const ALLOWED_SCHEMES: readonly string[] = ['http', 'https', 'mailto'];
export const ALLOWED_IMAGE_SCHEMES: readonly string[] = ['https'];

const SAFE_REL = 'noopener noreferrer';

/**
 * Presentational tags the legacy editor produced, mapped onto their allowed
 * equivalents before the allow-list runs, so formatting survives sanitising.
 * `h1` becomes `h2` because the page already has its one `h1`.
 */
export const TAG_REPLACEMENTS: Readonly<Record<string, string>> = {
	b: 'strong',
	i: 'em',
	h1: 'h2'
};

const markdown = new Marked({ gfm: true, async: false });

const sanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: [...ALLOWED_TAGS],
	allowedAttributes: Object.fromEntries(
		Object.entries(ALLOWED_ATTRIBUTES).map(([tag, attributes]) => [tag, [...attributes]])
	),
	allowedSchemes: [...ALLOWED_SCHEMES],
	allowedSchemesByTag: { img: [...ALLOWED_IMAGE_SCHEMES] },
	allowedSchemesAppliedToAttributes: ['href', 'src'],
	allowProtocolRelative: false,
	disallowedTagsMode: 'discard',
	transformTags: {
		...Object.fromEntries(
			Object.entries(TAG_REPLACEMENTS).map(([from, to]) => [
				from,
				sanitizeHtml.simpleTransform(to, {})
			])
		),
		a: (tagName, attribs) =>
			attribs.target === '_blank'
				? { tagName, attribs: { ...attribs, rel: SAFE_REL } }
				: { tagName, attribs }
	}
};

/**
 * Sanitises HTML that is already HTML (the legacy editor's article bodies)
 * against the same allow-list as `renderMarkdown`, without the Markdown pass:
 * a Markdown pass would read indented lines as code blocks and drop the
 * presentational tags the old editor used.
 */
export function sanitiseHtml(html: string): string {
	return sanitizeHtml(html, sanitizeOptions);
}

export function renderMarkdown(md: string): string {
	return sanitiseHtml(markdown.parse(md, { async: false }));
}
