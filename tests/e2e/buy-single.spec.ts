import { expect, test } from '@playwright/test';
import { addToCart, buyerEmail, catalogue, checkoutAsNewBuyer, videoFrame } from './fixtures.ts';

test('a visitor buys a single video with a new account and can watch it', async ({ page }) => {
	const slug = catalogue.singleSlug();

	await page.goto('/catalogue');
	await expect(page.getByRole('heading', { name: 'Learn at your own pace' })).toBeVisible();
	await page.locator(`a[href="/products/${slug}"]`).first().click();
	await expect(page).toHaveURL(new RegExp(`/products/${slug}$`));
	const title = (await page.getByRole('heading', { level: 1 }).innerText()).trim();

	await addToCart(page, slug);
	await expect(page.getByText(title).first()).toBeVisible();
	await checkoutAsNewBuyer(page, buyerEmail());

	await page.getByRole('link', { name: 'Go to your library' }).click();
	await expect(page).toHaveURL(/\/library$/);
	const collection = page.locator('h2', { hasText: `Video · ${title}` });
	await expect(collection).toBeVisible();
	await collection.locator('xpath=following-sibling::div[1]').getByRole('link').first().click();

	await expect(videoFrame(page)).toHaveAttribute('src', /[?&]token=[0-9a-f]{64}&expires=\d+/);
	await expect(page.getByText('This lesson is locked. Unlock it with:')).toHaveCount(0);
});
