import { expect, test } from '@playwright/test';
import { buyAsNewBuyer, catalogue, videoFrame } from './fixtures.ts';

const LOCKED = 'This lesson is locked. Unlock it with:';

test('an anonymous visitor sees the unlock options instead of the video', async ({ page }) => {
	await page.goto(catalogue.bundleLessonPath());
	await expect(page.getByText(LOCKED)).toBeVisible();
	await expect(page.locator(`a[href="/products/${catalogue.bundleSlug()}"]`)).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in' }).last()).toBeVisible();
	await expect(videoFrame(page)).toHaveCount(0);
});

test('the buyer of a single cannot watch a lesson that only the bundle contains', async ({
	page
}) => {
	await buyAsNewBuyer(page, catalogue.singleSlug());

	await page.goto(catalogue.bundleLessonPath());
	await expect(page.getByText(LOCKED)).toBeVisible();
	await expect(videoFrame(page)).toHaveCount(0);
});
