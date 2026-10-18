import { escapeHtml } from '#lib/shared/html.ts';
import { formatPence } from '#lib/shared/money.ts';

/**
 * Transactional email templates: pure functions returning subject, HTML and
 * text. Every user-supplied value is escaped in the HTML; the text part is
 * plain text and carries values verbatim. Wording and inline styling follow
 * `legacy/src/lib/server/email.ts` where a legacy template exists.
 */

export interface EmailContent {
	subject: string;
	html: string;
	text: string;
}

export const DEFAULT_SITE_URL = 'https://skylersewingsecrets.com';

const BRAND = '#8B5A5A';
const BODY_STYLE =
	"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;";
const BUTTON_STYLE = `display: inline-block; background-color: ${BRAND}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;`;

function layout(siteUrl: string, body: string): string {
	const safeSiteUrl = escapeHtml(siteUrl);
	return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body style="${BODY_STYLE}">
				<div style="text-align: center; margin-bottom: 30px;">
					<img src="${safeSiteUrl}/logo/logo.png" alt="Skyler's Sewing Secrets" style="max-width: 200px;">
				</div>
${body}
			</body>
			</html>
		`;
}

function button(href: string, label: string): string {
	return `
				<div style="text-align: center; margin: 30px 0;">
					<a href="${escapeHtml(href)}" style="${BUTTON_STYLE}">${label}</a>
				</div>`;
}

function footer(siteUrl: string, extra = ''): string {
	return `
				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

				<p style="font-size: 12px; color: #888; text-align: center;">
					Skyler's Sewing Secrets<br>
					<a href="${escapeHtml(siteUrl)}" style="color: ${BRAND};">skylersewingsecrets.com</a>${extra}
				</p>`;
}

export function welcomeEmail(name: string, siteUrl = DEFAULT_SITE_URL): EmailContent {
	const libraryUrl = `${siteUrl}/library`;

	return {
		subject: "Welcome to Skyler's Sewing Secrets!",
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">Welcome, ${escapeHtml(name)}!</h1>

				<p>Thank you for joining Skyler's Sewing Secrets! You now have lifetime access to everything you have purchased.</p>

				<p>Here's what you can do next:</p>

				<ul style="padding-left: 20px;">
					<li><strong>Start Learning:</strong> Head to your library to begin your first lesson</li>
					<li><strong>Track Progress:</strong> Mark lessons as complete as you go</li>
					<li><strong>Download Resources:</strong> Access patterns and guides in each lesson</li>
				</ul>
${button(libraryUrl, 'Go to My Library')}

				<p>If you have any questions, don't hesitate to reach out. I'm here to help you succeed!</p>

				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>
${footer(siteUrl)}`
		),
		text: `
Welcome, ${name}!

Thank you for joining Skyler's Sewing Secrets! You now have lifetime access to everything you have purchased.

Here's what you can do next:

- Start Learning: Head to your library to begin your first lesson
- Track Progress: Mark lessons as complete as you go
- Download Resources: Access patterns and guides in each lesson

Go to My Library: ${libraryUrl}

If you have any questions, don't hesitate to reach out. I'm here to help you succeed!

Happy sewing!
Skyler

---
Skyler's Sewing Secrets
${siteUrl}
		`.trim()
	};
}

export interface OrderConfirmationInput {
	name: string;
	items: Array<{ title: string; pricePence: number }>;
	totalPence: number;
	discountPence: number;
	libraryUrl: string;
}

export function orderConfirmationEmail(
	input: OrderConfirmationInput,
	siteUrl = DEFAULT_SITE_URL
): EmailContent {
	const { name, items, totalPence, discountPence, libraryUrl } = input;
	const total = formatPence(totalPence);
	const discount = discountPence > 0 ? formatPence(discountPence) : null;

	const itemRows = items
		.map(
			(item) => `
						<li>${escapeHtml(item.title)} — ${formatPence(item.pricePence)}</li>`
		)
		.join('');
	const itemLines = items.map((item) => `- ${item.title}: ${formatPence(item.pricePence)}`);

	return {
		subject: "Your Purchase Confirmation - Skyler's Sewing Secrets",
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">Thank You for Your Purchase!</h1>

				<p>Hi ${escapeHtml(name)},</p>

				<p>Your payment of <strong>${total}</strong> has been successfully processed. You now have lifetime access to everything in this order.</p>

				<div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: ${BRAND};">What's Included:</h3>
					<ul style="padding-left: 20px; margin-bottom: 0;">${itemRows}
					</ul>${
						discount
							? `
					<p style="margin-bottom: 0;">Discount: −${discount}</p>`
							: ''
					}
					<p style="margin-bottom: 0;"><strong>Total paid: ${total}</strong></p>
				</div>
${button(libraryUrl, 'Start Learning Now')}

				<p>If you have any questions, just reply to this email or visit our <a href="${escapeHtml(siteUrl)}/faq" style="color: ${BRAND};">FAQ page</a>.</p>

				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>

				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

				<p style="font-size: 12px; color: #888; text-align: center;">
					This is a receipt for your records. Please keep it for your files.<br>
					<a href="${escapeHtml(siteUrl)}" style="color: ${BRAND};">skylersewingsecrets.com</a>
				</p>`
		),
		text: [
			'Thank You for Your Purchase!',
			'',
			`Hi ${name},`,
			'',
			`Your payment of ${total} has been successfully processed. You now have lifetime access to everything in this order.`,
			'',
			"What's Included:",
			...itemLines,
			...(discount ? [`Discount: -${discount}`] : []),
			`Total paid: ${total}`,
			'',
			`Start Learning Now: ${libraryUrl}`,
			'',
			`If you have any questions, reply to this email or visit our FAQ page: ${siteUrl}/faq`,
			'',
			'Happy sewing!',
			'Skyler',
			'',
			'---',
			'This is a receipt for your records.',
			'skylersewingsecrets.com'
		].join('\n')
	};
}

export function passwordResetEmail(resetUrl: string, siteUrl = DEFAULT_SITE_URL): EmailContent {
	const safeResetUrl = escapeHtml(resetUrl);

	return {
		subject: "Reset Your Password - Skyler's Sewing Secrets",
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">Reset Your Password</h1>

				<p>We received a request to reset your password. Click the button below to create a new password:</p>
${button(resetUrl, 'Reset Password')}

				<p>If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.</p>

				<p>Best,<br>
				<strong>Skyler's Sewing Secrets</strong></p>

				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

				<p style="font-size: 12px; color: #888;">
					If the button doesn't work, copy and paste this link into your browser:<br>
					<a href="${safeResetUrl}" style="color: ${BRAND}; word-break: break-all;">${safeResetUrl}</a>
				</p>`
		),
		text: `
Reset Your Password

We received a request to reset your password. Visit the link below to create a new password:

${resetUrl}

If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.

Best,
Skyler's Sewing Secrets
		`.trim()
	};
}

/** The one-time code that lets a buyer claim an unverified account at checkout. */
export function signInCodeEmail(code: string, siteUrl = DEFAULT_SITE_URL): EmailContent {
	const safeCode = escapeHtml(code);

	return {
		subject: `${code} is your Skyler's Sewing Secrets code`,
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">Your sign-in code</h1>

				<p>Enter this code at checkout to confirm this email address is yours:</p>

				<p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: ${BRAND}; margin: 24px 0;">${safeCode}</p>

				<p>The code expires in 10 minutes. If you didn't ask for it, you can safely ignore this email.</p>

				<p>Best,<br>
				<strong>Skyler's Sewing Secrets</strong></p>`
		),
		text: `
Your sign-in code

Enter this code at checkout to confirm this email address is yours:

${code}

The code expires in 10 minutes. If you didn't ask for it, you can safely ignore this email.

Best,
Skyler's Sewing Secrets
		`.trim()
	};
}

export interface ContactNotificationInput {
	name: string;
	email: string;
	subject: string | null;
	message: string;
}

/** Sent to the site owner; `replyTo` on the message should be the sender's address. */
export function contactNotificationEmail(input: ContactNotificationInput): EmailContent {
	const { name, email, subject, message } = input;
	const safeEmail = escapeHtml(email);
	const cell = 'padding: 8px 0; border-bottom: 1px solid #eee;';

	return {
		subject: `New Contact Form Submission: ${subject || 'No Subject'}`,
		html: `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
			</head>
			<body style="${BODY_STYLE}">
				<h2 style="color: ${BRAND};">New Contact Form Submission</h2>

				<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
					<tr>
						<td style="${cell}"><strong>From:</strong></td>
						<td style="${cell}">${escapeHtml(name)}</td>
					</tr>
					<tr>
						<td style="${cell}"><strong>Email:</strong></td>
						<td style="${cell}"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
					</tr>
					<tr>
						<td style="${cell}"><strong>Subject:</strong></td>
						<td style="${cell}">${subject ? escapeHtml(subject) : '(No subject)'}</td>
					</tr>
				</table>

				<div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
					<strong>Message:</strong>
					<p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
				</div>

				<p style="font-size: 12px; color: #888;">
					Reply directly to this email to respond to the sender.
				</p>
			</body>
			</html>
		`,
		text: `
New Contact Form Submission

From: ${name}
Email: ${email}
Subject: ${subject || '(No subject)'}

Message:
${message}
		`.trim()
	};
}

export function newsletterConfirmEmail(
	confirmUrl: string,
	siteUrl = DEFAULT_SITE_URL
): EmailContent {
	return {
		subject: "Confirm your subscription to Couture Notes - Skyler's Sewing Secrets",
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">Confirm Your Subscription</h1>

				<p>Thank you for signing up for Couture Notes — practical insights from the workroom: tips, techniques, and inspiration to elevate your sewing.</p>

				<p>Please confirm your email address to start receiving it:</p>
${button(confirmUrl, 'Confirm Subscription')}

				<p>If you didn't sign up, you can safely ignore this email and you won't hear from us again.</p>

				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>
${footer(siteUrl)}`
		),
		text: `
Confirm Your Subscription

Thank you for signing up for Couture Notes — practical insights from the workroom: tips, techniques, and inspiration to elevate your sewing.

Please confirm your email address to start receiving it:

${confirmUrl}

If you didn't sign up, you can safely ignore this email and you won't hear from us again.

Happy sewing!
Skyler

---
Skyler's Sewing Secrets
${siteUrl}
		`.trim()
	};
}

export function newsletterWelcomeEmail(
	unsubscribeUrl: string,
	siteUrl = DEFAULT_SITE_URL
): EmailContent {
	const safeSiteUrl = escapeHtml(siteUrl);
	const unsubscribeLink = `<br>
					<a href="${escapeHtml(unsubscribeUrl)}" style="color: #888;">Unsubscribe</a>`;

	return {
		subject: "Welcome to Couture Notes - Skyler's Sewing Secrets",
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">Welcome to Couture Notes!</h1>

				<p>Thank you for subscribing! You'll receive practical insights from the workroom — tips, techniques, and inspiration to elevate your sewing.</p>

				<p>In the meantime, here are some things you might enjoy:</p>

				<ul style="padding-left: 20px;">
					<li><a href="${safeSiteUrl}/blog" style="color: ${BRAND};">Read the blog</a> — articles on sewing techniques and fabric care</li>
					<li><a href="${safeSiteUrl}/modules" style="color: ${BRAND};">Browse the course</a> — see what's inside Skyler's Sewing Secrets</li>
					<li><a href="${safeSiteUrl}/fabric-library" style="color: ${BRAND};">Explore the fabric library</a> — a visual guide to fabrics and their uses</li>
				</ul>

				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>
${footer(siteUrl, unsubscribeLink)}`
		),
		text: `
Welcome to Couture Notes!

Thank you for subscribing! You'll receive practical insights from the workroom — tips, techniques, and inspiration to elevate your sewing.

In the meantime, here are some things you might enjoy:

- Read the blog: ${siteUrl}/blog
- Browse the course: ${siteUrl}/modules
- Explore the fabric library: ${siteUrl}/fabric-library

Happy sewing!
Skyler

---
Skyler's Sewing Secrets
${siteUrl}

Unsubscribe: ${unsubscribeUrl}
		`.trim()
	};
}

export interface AccessRevokedInput {
	name: string;
	/** The order reference shown to the customer. */
	orderRef: string;
}

export function accessRevokedEmail(
	input: AccessRevokedInput,
	siteUrl = DEFAULT_SITE_URL
): EmailContent {
	const { name, orderRef } = input;
	const contactUrl = `${siteUrl}/contact`;

	return {
		subject: "An update on your order - Skyler's Sewing Secrets",
		html: layout(
			siteUrl,
			`
				<h1 style="color: ${BRAND}; margin-bottom: 20px;">An Update on Your Order</h1>

				<p>Hi ${escapeHtml(name)},</p>

				<p>Order <strong>${escapeHtml(orderRef)}</strong> has been refunded or disputed, so access to the lessons it included has been removed from your account. Anything else you own is unaffected.</p>

				<p>If you think this is a mistake, just reply to this email or get in touch and I'll sort it out.</p>
${button(contactUrl, 'Contact Us')}

				<p>Best,<br>
				<strong>Skyler</strong></p>
${footer(siteUrl)}`
		),
		text: `
An Update on Your Order

Hi ${name},

Order ${orderRef} has been refunded or disputed, so access to the lessons it included has been removed from your account. Anything else you own is unaffected.

If you think this is a mistake, just reply to this email or get in touch and I'll sort it out.

Contact Us: ${contactUrl}

Best,
Skyler

---
Skyler's Sewing Secrets
${siteUrl}
		`.trim()
	};
}
