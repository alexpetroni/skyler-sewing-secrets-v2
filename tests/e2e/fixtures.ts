import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { expect, type Page } from '@playwright/test';

// Shared helpers for the browser suite. Every variable is listed in
// tests/e2e/.env.example. Values are read inside tests, never at import time,
// so `playwright test --list` works without any of them.

/** A variable the spec cannot run without; fails the test with its name. */
export function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set (see tests/e2e/.env.example)`);
	return value;
}

/** A variable with a default that matches `scripts/seed-dev.ts`. */
function envOr(name: string, fallback: string): string {
	return process.env[name] || fallback;
}

/** The catalogue the money specs buy from; the defaults are the seed-dev rows. */
export const catalogue = {
	singleSlug: () => envOr('E2E_SINGLE_SLUG', 'perfect-french-seams'),
	bundleSlug: () => envOr('E2E_BUNDLE_SLUG', 'finishing-touches'),
	/**
	 * A lesson the bundle is the cheapest offer for: in the bundle, not sold as a
	 * single. The lesson page links only the cheapest product and the course.
	 */
	bundleLessonPath: () =>
		envOr('E2E_BUNDLE_LESSON_PATH', '/modules/getting-started/your-first-seam')
};

/**
 * A fresh address for a throwaway buyer: `E2E_BUYER_EMAIL_PREFIX` with a unique
 * suffix before the `@` (`delivered+e2e@resend.dev` → `delivered+e2e-…@resend.dev`).
 * Resend's `delivered@resend.dev` sink accepts the welcome and receipt emails.
 */
export function buyerEmail(): string {
	const prefix = envOr('E2E_BUYER_EMAIL_PREFIX', 'delivered+e2e@resend.dev');
	const at = prefix.lastIndexOf('@');
	if (at < 1) throw new Error('E2E_BUYER_EMAIL_PREFIX must be an address like name+tag@domain');
	const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return `${prefix.slice(0, at)}-${suffix}${prefix.slice(at)}`;
}

/** The password every throwaway buyer gets at checkout. */
export const BUYER_PASSWORD = 'e2e-buyer-password';

/** The code an authenticator app shows now for the base32 secret of a TOTP URI. */
export function totpCode(secret: string): Promise<string> {
	return createOTP(new TextDecoder().decode(base32.decode(secret))).totp();
}

/** Signs in with email and password and waits until the sign-in page is left. */
export async function login(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/auth/sign-in');
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/sign-in'));
}

/** Signs the admin in, answering the TOTP challenge, and lands on `/admin`. */
export async function loginAdmin(page: Page, totpSecret: string): Promise<void> {
	await login(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
	await expect(page).toHaveURL(/\/auth\/two-factor/);
	await page.getByLabel('Authentication code').fill(await totpCode(totpSecret));
	await page.getByRole('button', { name: 'Continue', exact: true }).click();
	await expect(page).toHaveURL(/\/admin(\/|$)/);
}

/** Stripe's always-succeeding UK test card. */
export const TEST_CARD = {
	number: '4242 4242 4242 4242',
	/** Any future month: December of next year. */
	expiry: `12 / ${String((new Date().getFullYear() + 1) % 100).padStart(2, '0')}`,
	cvc: '123',
	name: 'E2E Buyer',
	postcode: 'SW1A 1AA'
};

/**
 * Pays on the hosted Stripe Checkout page with the test card and waits for the
 * redirect back to `/checkout/success`.
 */
export async function payWithTestCard(page: Page): Promise<void> {
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	// Newer Checkout layouts fold the card form into an accordion.
	const cardAccordion = page.getByTestId('card-accordion-item-button');
	if (await cardAccordion.isVisible().catch(() => false)) await cardAccordion.click();
	await page.locator('#cardNumber').fill(TEST_CARD.number);
	await page.locator('#cardExpiry').fill(TEST_CARD.expiry);
	await page.locator('#cardCvc').fill(TEST_CARD.cvc);
	await page.locator('#billingName').fill(TEST_CARD.name);
	const country = page.locator('#billingCountry');
	if (await country.isVisible().catch(() => false)) await country.selectOption('GB');
	const postcode = page.locator('#billingPostalCode');
	if (await postcode.isVisible().catch(() => false)) await postcode.fill(TEST_CARD.postcode);
	await page.getByTestId('hosted-payment-submit-button').click();
	await page.waitForURL(/\/checkout\/success/, { timeout: 90_000 });
}

/** Adds the product to the cart from its page and opens the cart. */
export async function addToCart(page: Page, slug: string): Promise<void> {
	await page.goto(`/products/${slug}`);
	await page.getByRole('button', { name: 'Add to cart' }).first().click();
	await expect(page.getByRole('button', { name: 'In your cart' }).first()).toBeVisible();
	await page.goto('/cart');
	await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
}

/**
 * From the cart: checks out as a brand-new account, pays, and waits for the
 * success page to confirm ownership (it refreshes itself while the webhook lands).
 */
export async function checkoutAsNewBuyer(page: Page, email: string): Promise<void> {
	await page.getByRole('link', { name: 'Checkout', exact: true }).click();
	await expect(page).toHaveURL(/\/checkout$/);
	await page.getByLabel('Full name').fill('E2E Buyer');
	await page.getByLabel('Email address').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(BUYER_PASSWORD);
	await page.getByRole('button', { name: /Continue to payment/ }).click();
	await payWithTestCard(page);
	await expect(
		page.getByRole('heading', { name: "Welcome to Skyler's Sewing Secrets" })
	).toBeVisible({ timeout: 60_000 });
}

/** Buys one product as a new account and returns that account's email. */
export async function buyAsNewBuyer(page: Page, slug: string): Promise<string> {
	const email = buyerEmail();
	await addToCart(page, slug);
	await checkoutAsNewBuyer(page, email);
	return email;
}

/** The Bunny player on a lesson page; its `src` carries the signed token. */
export function videoFrame(page: Page) {
	return page.locator('iframe[src*="iframe.mediadelivery.net/embed/"]');
}
