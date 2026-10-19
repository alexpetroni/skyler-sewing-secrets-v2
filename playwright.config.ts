import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The suite runs against a deployed preview (Stripe test mode, a Neon branch),
// never against a local server. Variables come from the CI secrets or, locally,
// from tests/e2e/.env (copy tests/e2e/.env.example).
const localEnv = 'tests/e2e/.env';
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.spec.ts',
	// Every spec buys or mutates on one shared deployment: run them one at a time.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 1,
	timeout: 120_000,
	expect: { timeout: 15_000 },
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: process.env.E2E_BASE_URL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		locale: 'en-GB',
		timezoneId: 'Europe/London'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
