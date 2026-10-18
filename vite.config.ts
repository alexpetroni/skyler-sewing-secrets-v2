import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ runtime: 'nodejs24.x' }),
			csrf: { trustedOrigins: [] }
		})
	],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		exclude: ['legacy/**', 'node_modules/**', 'tests/e2e/**'],
		expect: { requireAssertions: true }
	}
});
