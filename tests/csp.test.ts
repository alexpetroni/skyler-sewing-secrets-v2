import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Content Security Policy is static configuration in vite.config.ts, so
 * this reads the file: every directive PHASE-20 lists must be present with
 * its sources, in nonce mode. The hook test checks the header reaches the
 * client; this one checks what it says.
 */
describe('Content Security Policy configuration', () => {
	// Collapsed whitespace so wrapped arrays compare like single-line ones.
	const config = readFileSync('vite.config.ts', 'utf8')
		.replace(/\s+/g, ' ')
		.replace(/\[\s+/g, '[')
		.replace(/\s+\]/g, ']');
	const cspBlock = config.slice(config.indexOf('csp: {'));

	it('is nonce based', () => {
		expect(cspBlock).toContain("mode: 'nonce'");
	});

	it.each([
		['default-src', ["'self'"]],
		['script-src', ["'self'", "'https://challenges.cloudflare.com'"]],
		['style-src', ["'self'", "'unsafe-inline'"]],
		['font-src', ["'self'"]],
		['frame-src', ["'https://iframe.mediadelivery.net'", "'https://challenges.cloudflare.com'"]],
		[
			'connect-src',
			["'self'", "'https://video.bunnycdn.com'", "'https://challenges.cloudflare.com'"]
		],
		['form-action', ["'self'", "'https://accounts.google.com'", "'https://checkout.stripe.com'"]],
		['base-uri', ["'self'"]],
		['object-src', ["'none'"]],
		['frame-ancestors', ["'none'"]]
	])('lists %s with its sources', (directive, sources) => {
		expect(cspBlock).toContain(`'${directive}': [${sources.join(', ')}]`);
	});

	it('allows images from self, data, blob, the Bunny pull zones and Google avatars', () => {
		expect(cspBlock).toContain("'img-src': imgSrc");
		expect(config).toContain(
			"= ['self', 'data:', 'blob:', 'https://*.b-cdn.net', 'https://*.googleusercontent.com']"
		);
		// The configured pull zone host joins the list at build time.
		expect(config).toContain(
			'imgSrc.push(`https://${new URL(PUBLIC_BUNNY_CDN_URL).host}` as ImgSrc[number])'
		);
	});

	it('upgrades insecure requests', () => {
		expect(cspBlock).toContain("'upgrade-insecure-requests': true");
	});

	it('app.html scripts, if any, carry the SvelteKit nonce', () => {
		const html = readFileSync('src/app.html', 'utf8');
		const scripts = html.match(/<script\b[^>]*>/g) ?? [];
		for (const tag of scripts) expect(tag).toContain('nonce="%sveltekit.nonce%"');
		// The template documents the rule for whoever adds the first script.
		expect(html).toContain('nonce="%sveltekit.nonce%"');
	});
});
