import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { addToCart, buyerEmail, catalogue, checkoutAsNewBuyer, videoFrame } from './fixtures.ts';

/** Runs the Stripe CLI (test mode, key from STRIPE_API_KEY) and parses its JSON output. */
function stripe(...args: string[]): Record<string, unknown> {
	return JSON.parse(execFileSync('stripe', args, { encoding: 'utf8' })) as Record<string, unknown>;
}

test.skip(!process.env.E2E_STRIPE_CLI, 'needs stripe cli');

test('refunding the order removes access to what it bought', async ({ page }) => {
	const slug = catalogue.singleSlug();
	await page.goto(`/products/${slug}`);
	const title = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
	await addToCart(page, slug);
	await checkoutAsNewBuyer(page, buyerEmail());
	const sessionId = new URL(page.url()).searchParams.get('session_id');
	expect(sessionId).toMatch(/^cs_test_/);

	await page.goto('/library');
	const collection = page.locator('h2', { hasText: `Video · ${title}` });
	await collection.locator('xpath=following-sibling::div[1]').getByRole('link').first().click();
	const lessonUrl = page.url();
	await expect(videoFrame(page)).toHaveCount(1);

	// `stripe trigger charge.refunded` would refund a fresh fixture charge that
	// belongs to no order; refunding this order's payment intent makes Stripe
	// send the real charge.refunded event for it to the preview's webhook.
	const session = stripe('checkout', 'sessions', 'retrieve', sessionId ?? '');
	const paymentIntent = session.payment_intent;
	expect(typeof paymentIntent).toBe('string');
	const refund = stripe('refunds', 'create', `--payment-intent=${String(paymentIntent)}`);
	expect(refund.status).toMatch(/^(succeeded|pending)$/);

	await expect
		.poll(
			async () => {
				await page.goto(lessonUrl);
				return videoFrame(page).count();
			},
			{ timeout: 90_000, intervals: [2_000, 5_000] }
		)
		.toBe(0);
	await expect(page.getByText('This lesson is locked. Unlock it with:')).toBeVisible();
	await page.goto('/library');
	await expect(page.locator('h2', { hasText: `Video · ${title}` })).toHaveCount(0);
});
