import { expect, test } from '@playwright/test';
import { loginAdmin, requireEnv } from './fixtures.ts';

/** Search terms for the two existing, published, ready lessons the bundle is built from. */
function lessonQueries(): string[] {
	const raw = process.env.E2E_ADMIN_BUNDLE_LESSONS || 'Perfect French seams,Invisible zips';
	const queries = raw
		.split(',')
		.map((query) => query.trim())
		.filter(Boolean);
	if (queries.length !== 2) throw new Error('E2E_ADMIN_BUNDLE_LESSONS must name two lessons');
	return queries;
}

test.skip(!process.env.E2E_ADMIN_TOTP_SECRET, 'needs E2E_ADMIN_TOTP_SECRET to pass the admin 2FA');

test('the admin composes a bundle from two lessons, publishes it and sees it listed', async ({
	page
}) => {
	await loginAdmin(page, requireEnv('E2E_ADMIN_TOTP_SECRET'));
	const stamp = Date.now().toString(36);
	const title = `E2E bundle ${stamp}`;
	const slug = `e2e-bundle-${stamp}`;

	await page.goto('/admin/catalogue/new');
	await page.getByLabel('Kind').selectOption('bundle');
	await page.getByLabel('Price (£)').fill('19.00');
	await page.getByLabel('Title').fill(title);
	await page.getByLabel('Slug').fill(slug);
	await page.getByRole('button', { name: 'Create Product' }).click();
	await expect(page).toHaveURL(/\/admin\/catalogue\/[0-9a-f-]{36}$/);
	const productUrl = page.url();

	// The publish checklist needs a description and a cover image.
	await page
		.getByLabel('Description')
		.fill('Two lessons, bought together. Created by the E2E suite.');
	await page.getByLabel('Cover image URL').fill('https://e2e.b-cdn.net/covers/e2e-bundle.jpg');
	await page.getByRole('button', { name: 'Save Basics' }).click();
	await expect(page.getByLabel('Cover image URL')).toHaveValue(/e2e-bundle\.jpg$/);

	const search = page.getByLabel('Add a video');
	for (const query of lessonQueries()) {
		await search.fill(query);
		await page
			.locator('li', { hasText: query })
			.getByRole('button', { name: 'Add', exact: true })
			.first()
			.click();
	}
	await page.getByRole('button', { name: 'Save Contents' }).click();
	await expect(page.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(2);

	await page.locator('#product-isPublished').check();
	await page.getByRole('button', { name: 'Save Visibility' }).click();
	await page.reload();
	await expect(page.locator('#product-isPublished')).toBeChecked();

	await page.goto('/catalogue');
	await expect(page.locator(`a[href="/products/${slug}"]`).first()).toBeVisible();

	// Leave the shared preview catalogue as it was.
	await page.goto(productUrl);
	await page.locator('#product-isPublished').uncheck();
	await page.getByRole('button', { name: 'Save Visibility' }).click();
	await page.reload();
	await expect(page.locator('#product-isPublished')).not.toBeChecked();
});
