import { describe, expect, it } from 'vitest';
import * as marketing from './index.ts';
import {
	accessRevokedEmail,
	contactNotificationEmail,
	newsletterConfirmEmail,
	newsletterWelcomeEmail,
	orderConfirmationEmail,
	passwordResetEmail,
	signInCodeEmail,
	type EmailContent,
	welcomeEmail
} from './index.ts';

const SITE = 'https://beta.skylersewingsecrets.com';
const XSS = '<script>alert(1)</script>';
const ESCAPED_XSS = '&lt;script&gt;alert(1)&lt;/script&gt;';
/** Tries to close the href attribute and open a tag. */
const ATTR_BREAKOUT = `https://evil.example/"><script>alert(1)</script>`;

interface TemplateCase {
	template: string;
	/** Renders with every user-supplied field set to `value`. */
	hostile: (value: string) => EmailContent;
	/** Renders with ordinary values. */
	normal: () => EmailContent;
	/** The link (or address) the reader must be able to act on, in both parts. */
	primaryLink: string;
}

const cases: TemplateCase[] = [
	{
		template: 'welcomeEmail',
		hostile: (value) => welcomeEmail(value, SITE),
		normal: () => welcomeEmail('Jane', SITE),
		primaryLink: `${SITE}/library`
	},
	{
		template: 'orderConfirmationEmail',
		hostile: (value) =>
			orderConfirmationEmail(
				{
					name: value,
					items: [
						{ title: value, pricePence: 14900 },
						{ title: `Second ${value}`, pricePence: 900 }
					],
					totalPence: 12920,
					discountPence: 2880,
					libraryUrl: value
				},
				SITE
			),
		normal: () =>
			orderConfirmationEmail(
				{
					name: 'Jane',
					items: [{ title: 'Chanel Skirt', pricePence: 3900 }],
					totalPence: 3900,
					discountPence: 0,
					libraryUrl: `${SITE}/library`
				},
				SITE
			),
		primaryLink: `${SITE}/library`
	},
	{
		template: 'passwordResetEmail',
		hostile: (value) => passwordResetEmail(value, SITE),
		normal: () => passwordResetEmail(`${SITE}/auth/reset-password?token=abc123`, SITE),
		primaryLink: `${SITE}/auth/reset-password?token=abc123`
	},
	{
		template: 'signInCodeEmail',
		hostile: (value) => signInCodeEmail(value, SITE),
		normal: () => signInCodeEmail('123456', SITE),
		primaryLink: '123456'
	},
	{
		template: 'contactNotificationEmail',
		hostile: (value) =>
			contactNotificationEmail({ name: value, email: value, subject: value, message: value }),
		normal: () =>
			contactNotificationEmail({
				name: 'Jane',
				email: 'jane@example.com',
				subject: 'Hemming',
				message: 'Hello'
			}),
		primaryLink: 'jane@example.com'
	},
	{
		template: 'newsletterConfirmEmail',
		hostile: (value) => newsletterConfirmEmail(value, SITE),
		normal: () => newsletterConfirmEmail(`${SITE}/newsletter/confirm?token=t0k`, SITE),
		primaryLink: `${SITE}/newsletter/confirm?token=t0k`
	},
	{
		template: 'newsletterWelcomeEmail',
		hostile: (value) => newsletterWelcomeEmail(value, SITE),
		normal: () => newsletterWelcomeEmail(`${SITE}/newsletter/unsubscribe?token=u1`, SITE),
		primaryLink: `${SITE}/newsletter/unsubscribe?token=u1`
	},
	{
		template: 'accessRevokedEmail',
		hostile: (value) => accessRevokedEmail({ name: value, orderRef: value }, SITE),
		normal: () => accessRevokedEmail({ name: 'Jane', orderRef: 'SSS-1042' }, SITE),
		primaryLink: `${SITE}/contact`
	}
];

describe('email templates', () => {
	it('cover every exported template (all eight)', () => {
		const exported = Object.entries(marketing)
			.filter(([key, value]) => key.endsWith('Email') && typeof value === 'function')
			.map(([key]) => key)
			.sort();
		expect(cases.map((c) => c.template).sort()).toEqual(exported);
		expect(exported).toHaveLength(8);
	});

	describe.each(cases)('$template', ({ hostile, normal, primaryLink }) => {
		it('escapes <script> in every user-supplied field of the html', () => {
			const { html } = hostile(XSS);
			expect(html).not.toContain('<script');
			expect(html).toContain(ESCAPED_XSS);
		});

		it('cannot be broken out of an attribute with a quote', () => {
			const { html } = hostile(ATTR_BREAKOUT);
			expect(html).not.toContain('"><script>');
			expect(html).not.toContain('<script');
			expect(html).toContain('&quot;&gt;&lt;script&gt;');
		});

		it('has a subject, and both text and html contain the primary link', () => {
			const { subject, html, text } = normal();
			expect(subject.length).toBeGreaterThan(0);
			expect(html).toContain(primaryLink);
			expect(text).toContain(primaryLink);
		});

		it('keeps the text part free of HTML markup', () => {
			expect(normal().text).not.toMatch(/<\/?[a-z][^>]*>/i);
		});
	});

	it('escapes every user field of contactNotificationEmail individually', () => {
		const fields = ['name', 'email', 'subject', 'message'] as const;
		for (const field of fields) {
			const input = {
				name: 'Jane',
				email: 'jane@example.com',
				subject: 'Hemming',
				message: 'Hello',
				[field]: XSS
			};
			const { html } = contactNotificationEmail(input);
			expect(html, field).not.toContain('<script');
			expect(html, field).toContain(ESCAPED_XSS);
		}
	});

	it('escapes every item title of orderConfirmationEmail', () => {
		const { html, text } = orderConfirmationEmail({
			name: 'Jane',
			items: [
				{ title: 'Safe title', pricePence: 100 },
				{ title: XSS, pricePence: 200 }
			],
			totalPence: 300,
			discountPence: 0,
			libraryUrl: `${SITE}/library`
		});
		expect(html).not.toContain('<script');
		expect(html).toContain(`${ESCAPED_XSS} — £2.00`);
		expect(text).toContain('Safe title: £1.00');
	});

	it('orderConfirmationEmail shows prices, the discount and the total in pounds', () => {
		const { html, text } = orderConfirmationEmail({
			name: 'Jane',
			items: [
				{ title: 'Flagship course', pricePence: 14900 },
				{ title: 'Pressing Seams', pricePence: 900 }
			],
			totalPence: 12920,
			discountPence: 2880,
			libraryUrl: `${SITE}/library`
		});
		for (const part of [html, text]) {
			expect(part).toContain('£149.00');
			expect(part).toContain('£9.00');
			expect(part).toContain('£28.80');
			expect(part).toContain('Total paid: £129.20');
		}
	});

	it('orderConfirmationEmail omits the discount line when nothing was discounted', () => {
		const { html, text } = cases[1].normal();
		expect(html).not.toContain('Discount');
		expect(text).not.toContain('Discount');
	});

	// Ported from legacy/src/lib/server/email.test.ts.
	it('contactNotificationEmail escapes user-supplied HTML in the html body', () => {
		const { html } = contactNotificationEmail({
			name: '<b>x</b>',
			email: 'a@b.c',
			subject: null,
			message: '<script>'
		});
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
		expect(html).toContain('(No subject)');
	});
});
