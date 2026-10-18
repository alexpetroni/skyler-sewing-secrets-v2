import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Header from '#lib/components/layout/Header.svelte';
import Badge from '#lib/components/ui/Badge.svelte';
import Button from '#lib/components/ui/Button.svelte';
import Input from '#lib/components/ui/Input.svelte';
import OptimizedImage from '#lib/components/ui/OptimizedImage.svelte';

const publicEnv = vi.hoisted(() => ({ cdn: undefined as string | undefined }));

vi.mock('$app/env/public', () => ({
	get PUBLIC_BUNNY_CDN_URL() {
		return publicEnv.cdn;
	}
}));

function text(value: string) {
	return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

/**
 * `$app/state` reads the page from the context SvelteKit sets while server rendering
 * (`__request__`); outside a request the component tree is given an equivalent one.
 */
function requestContext(pathname: string) {
	return new Map([['__request__', { page: { url: new URL(pathname, 'https://example.com') } }]]);
}

beforeEach(() => {
	publicEnv.cdn = undefined;
});

describe('Button', () => {
	it('renders a <button> with the primary classes', () => {
		const { body } = render(Button, { props: { children: text('Enrol') } });

		expect(body).toMatch(/<button[^>]*type="button"/);
		expect(body).toMatch(/<button[^>]*class="[^"]*\bbtn-primary\b/);
		expect(body).not.toMatch(/<button[^>]*\bdisabled\b/);
		expect(body).toContain('Enrol');
	});

	it('is disabled when asked', () => {
		const { body } = render(Button, { props: { disabled: true, children: text('Enrol') } });

		expect(body).toMatch(/<button[^>]*\bdisabled\b/);
	});
});

describe('Badge', () => {
	it('applies the classes of each variant', () => {
		const sage = render(Badge, { props: { variant: 'sage', children: text('New') } }).body;
		const error = render(Badge, { props: { variant: 'error', children: text('Failed') } }).body;
		const fallback = render(Badge, { props: { children: text('Draft') } }).body;

		expect(sage).toContain('bg-sage-100/80 text-sage-700');
		expect(error).toContain('bg-red-900/[0.06] text-red-800');
		expect(error).not.toContain('text-sage-700');
		expect(fallback).toContain('text-charcoal-600');
	});
});

describe('Input', () => {
	it('associates the label with the input and shows the error', () => {
		const { body } = render(Input, {
			props: { label: 'Email address', name: 'email', id: 'email', error: 'Enter your email' }
		});

		expect(body).toMatch(/<label[^>]*for="email"[^>]*>Email address<\/label>/);
		expect(body).toMatch(/<input[^>]*name="email"/);
		expect(body).toMatch(/<input[^>]*id="email"/);
		expect(body).toMatch(/<input[^>]*aria-invalid="true"/);
		expect(body).toMatch(/<input[^>]*aria-describedby="email-error"/);
		expect(body).toMatch(/<p[^>]*id="email-error"[^>]*>Enter your email<\/p>/);
	});

	it('generates an id that the label points at when none is given', () => {
		const { body } = render(Input, { props: { label: 'Name', name: 'name' } });

		const labelFor = body.match(/<label[^>]*for="([^"]+)"/)?.[1];
		const inputId = body.match(/<input[^>]*id="([^"]+)"/)?.[1];
		expect(labelFor).toBeTruthy();
		expect(inputId).toBe(labelFor);
	});
});

describe('OptimizedImage', () => {
	it('builds a CDN srcset with width and quality parameters when a CDN URL is set', () => {
		publicEnv.cdn = 'https://cdn.example.com';

		const { body } = render(OptimizedImage, {
			props: { src: '/images/hero-sewing.jpg', alt: 'Hero', width: 800, quality: 70 }
		});

		expect(body).toContain(
			'src="https://cdn.example.com/images/hero-sewing.jpg?width=800&amp;quality=70"'
		);
		const srcset = body.match(/srcset="([^"]+)"/)?.[1];
		expect(srcset?.split(', ')).toEqual(
			[400, 800, 1200, 1600].map(
				(w) => `https://cdn.example.com/images/hero-sewing.jpg?width=${w}&amp;quality=70 ${w}w`
			)
		);
		expect(body).toContain('sizes="(max-width: 800px) 100vw, 800px"');
	});

	it('renders the plain src without a srcset when no CDN URL is set', () => {
		const { body } = render(OptimizedImage, {
			props: { src: '/images/hero-sewing.jpg', alt: 'Hero' }
		});

		expect(body).toMatch(/<img[^>]*src="[^"]*images\/hero-sewing\.jpg"/);
		expect(body).not.toContain('srcset');
		expect(body).not.toContain('width=');
	});
});

describe('Header', () => {
	it('shows the sign-in link and no account menu when signed out', () => {
		const { body } = render(Header, { props: { viewer: null }, context: requestContext('/') });

		expect(body).toMatch(/<a[^>]*href="\/auth\/sign-in"[^>]*>\s*Log in\s*<\/a>/);
		expect(body).toMatch(/<a[^>]*href="\/catalogue"[^>]*>\s*Catalogue/);
		expect(body).not.toContain('aria-haspopup="menu"');
	});

	it('shows the avatar initials menu for a signed-in viewer', () => {
		const { body } = render(Header, {
			props: { viewer: { name: 'Ada Lovelace', avatarUrl: null, isAdmin: false } },
			context: requestContext('/')
		});

		expect(body).toContain('aria-haspopup="menu"');
		expect(body).toMatch(/<span[^>]*rounded-full[^>]*>\s*AL\s*<\/span>/);
		expect(body).toMatch(/>\s*Ada\s*<\/span>/);
		expect(body).not.toContain('href="/auth/sign-in"');
	});

	it('shows the avatar image and marks the active link', () => {
		const { body } = render(Header, {
			props: {
				viewer: { name: 'Ada Lovelace', avatarUrl: 'https://img.example.com/a.jpg', isAdmin: true }
			},
			context: requestContext('/catalogue')
		});

		expect(body).toMatch(/<img[^>]*src="https:\/\/img\.example\.com\/a\.jpg"/);
		expect(body).toContain('aria-haspopup="menu"');
		// The current section is marked with the gold underline.
		expect(body).toMatch(
			/<a href="\/catalogue" class="[^"]*\stext-charcoal-900"[^>]*>\s*Catalogue\s*(?:<!--[^>]*-->)?<span[^>]*bg-gold-400/
		);
		expect(body).not.toMatch(/<a href="\/modules" class="[^"]*\stext-charcoal-900"/);
	});
});
