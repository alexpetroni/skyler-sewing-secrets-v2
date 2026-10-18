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
		a: (tagName, attribs) =>
			attribs.target === '_blank'
				? { tagName, attribs: { ...attribs, rel: SAFE_REL } }
				: { tagName, attribs }
	}
};

export function renderMarkdown(md: string): string {
	const html = markdown.parse(md, { async: false });
	return sanitizeHtml(html, sanitizeOptions);
}
