import { expect, test } from '@playwright/test';
import { login, requireEnv, videoFrame } from './fixtures.ts';

test('a migrated member owns the course, watches a lesson and keeps progress', async ({ page }) => {
	await login(page, requireEnv('E2E_MEMBER_EMAIL'), requireEnv('E2E_MEMBER_PASSWORD'));

	await page.goto('/library');
	await expect(page.getByRole('heading', { level: 1, name: /^Welcome back/ })).toBeVisible();
	const modules = page.locator('h2', { hasText: /^Modules$/ });
	await expect(modules).toBeVisible();

	await modules.locator('xpath=following-sibling::div[1]').getByRole('link').first().click();
	await expect(page).toHaveURL(/\/modules\/[^/]+$/);
	// The module page links each of its lessons below its own path.
	await page
		.locator(`a[href^="${new URL(page.url()).pathname}/"]`)
		.first()
		.click();
	await expect(page).toHaveURL(/\/modules\/[^/]+\/[^/]+$/);

	await expect(videoFrame(page)).toHaveAttribute('src', /[?&]token=[0-9a-f]{64}&expires=\d+/);

	// A rerun with the same member finds the lesson already completed; the
	// reload below still proves the stored progress is what the page shows.
	const markComplete = page.getByRole('button', { name: 'Mark complete' });
	if (await markComplete.isVisible()) await markComplete.click();
	await expect(page.getByText('Completed', { exact: true })).toBeVisible();

	await page.reload();
	await expect(page.getByText('Completed', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0);
});
