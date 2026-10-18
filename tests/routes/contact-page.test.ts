import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from '../../src/routes/(marketing)/contact/+page.svelte';

const publicEnv = vi.hoisted(() => ({ turnstile: undefined as string | undefined }));

vi.mock('$app/env/public', () => ({
	PUBLIC_SITE_URL: 'https://skylersewingsecrets.com',
	PUBLIC_BUNNY_CDN_URL: undefined,
	get PUBLIC_TURNSTILE_SITE_KEY() {
		return publicEnv.turnstile;
	}
}));

type PageProps = Parameters<typeof ContactPage>[1];

/** `$app/state` reads the page from the context SvelteKit sets while server rendering. */
const context = new Map([
	['__request__', { page: { url: new URL('https://skylersewingsecrets.com/contact') } }]
]);

function renderPage() {
	const props = { data: {}, form: null, params: {} } as unknown as PageProps;
	return render(ContactPage, { props, context });
}

describe('/contact page', () => {
	beforeEach(() => {
		publicEnv.turnstile = undefined;
	});

	it('renders the form with a hidden, unfocusable, non-autofilled honeypot', () => {
		const { body, head } = renderPage();

		expect(body).toContain('method="POST"');
		expect(body).toMatch(
			/<div class="sr-only" aria-hidden="true">.*<input id="contact-website" name="website" tabindex="-1" autocomplete="off"/s
		);
		expect(head).toContain('<link rel="canonical" href="https://skylersewingsecrets.com/contact"');
	});

	it('leaves the Turnstile widget and script out without a site key', () => {
		const { body, head } = renderPage();

		expect(body).not.toContain('cf-turnstile');
		expect(head).not.toContain('challenges.cloudflare.com');
	});

	it('renders the Turnstile widget and script when the site key is set', () => {
		publicEnv.turnstile = '0x4AAAAAAA-site-key';

		const { body, head } = renderPage();

		expect(body).toContain('class="cf-turnstile" data-sitekey="0x4AAAAAAA-site-key"');
		expect(head).toContain('src="https://challenges.cloudflare.com/turnstile/v0/api.js"');
	});
});
