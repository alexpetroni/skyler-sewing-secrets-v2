import { expect, type Page, test } from '@playwright/test';
import { addToCart, buyerEmail, catalogue, checkoutAsNewBuyer, requireEnv } from './fixtures.ts';

/** The cart's total in pence, read from the "£12.34" the summary shows. */
async function cartTotal(page: Page): Promise<number> {
	const text = await page
		.locator('dt', { hasText: /^Total$/ })
		.locator('xpath=following-sibling::dd[1]')
		.innerText();
	const match = /£([\d,]+)\.(\d{2})/.exec(text);
	if (!match) throw new Error(`unexpected total: ${text}`);
	return Number(match[1].replaceAll(',', '')) * 100 + Number(match[2]);
}

test('a discount code reduces the bundle total and the purchase completes', async ({ page }) => {
	const code = requireEnv('E2E_PROMO_CODE').toUpperCase();

	await addToCart(page, catalogue.bundleSlug());
	const before = await cartTotal(page);

	await page.locator('#promo-code').fill(code);
	await page.getByRole('button', { name: 'Apply', exact: true }).click();
	await expect(page.getByText(`Discount (${code})`)).toBeVisible();
	const after = await cartTotal(page);
	expect(after).toBeLessThan(before);
	expect(after).toBeGreaterThanOrEqual(0);

	await checkoutAsNewBuyer(page, buyerEmail());
	await expect(page.getByText(`Code ${code} applied`)).toBeVisible();
});
