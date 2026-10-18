import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

type KitOptions = NonNullable<Parameters<typeof sveltekit>[0]>;
type ImgSrc = NonNullable<NonNullable<NonNullable<KitOptions['csp']>['directives']>['img-src']>;

export default defineConfig(({ mode }) => {
	// The only deployment-specific directive: the image pull zone. It is read
	// at build time from the variable src/env.ts declares; `https://*.b-cdn.net`
	// already covers every Bunny pull zone, so the build needs no environment.
	const { PUBLIC_BUNNY_CDN_URL } = loadEnv(mode, process.cwd(), 'PUBLIC_BUNNY_CDN_URL');
	const imgSrc: ImgSrc = ['self', 'data:', 'blob:', 'https://*.b-cdn.net'];
	// `new URL` has validated the host; the template-literal Source type cannot see that.
	if (PUBLIC_BUNNY_CDN_URL)
		imgSrc.push(`https://${new URL(PUBLIC_BUNNY_CDN_URL).host}` as ImgSrc[number]);

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter({ runtime: 'nodejs24.x' }),
				csrf: { trustedOrigins: [] },
				// Nonce-based CSP (security audit M2). SvelteKit adds the nonce to
				// the scripts it emits; app.html carries %sveltekit.nonce% on its
				// own. 'unsafe-inline' styles stay allowed because Svelte
				// transitions and the reveal action set inline styles; Tailwind
				// utilities are classes and need nothing. See docs/SECURITY.md.
				csp: {
					mode: 'nonce',
					directives: {
						'default-src': ['self'],
						'script-src': ['self', 'https://challenges.cloudflare.com'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': imgSrc,
						'font-src': ['self'],
						'frame-src': ['https://iframe.mediadelivery.net', 'https://challenges.cloudflare.com'],
						'connect-src': [
							'self',
							'https://video.bunnycdn.com',
							'https://challenges.cloudflare.com'
						],
						'form-action': ['self'],
						'base-uri': ['self'],
						'object-src': ['none'],
						'frame-ancestors': ['none'],
						'upgrade-insecure-requests': true
					}
				}
			})
		],
		test: {
			environment: 'node',
			include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
			exclude: ['legacy/**', 'node_modules/**', 'tests/e2e/**'],
			expect: { requireAssertions: true }
		}
	};
});
