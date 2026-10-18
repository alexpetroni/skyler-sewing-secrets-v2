import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

interface SendEmailOptions {
	to: string | string[];
	subject: string;
	html: string;
	text?: string;
	replyTo?: string;
}

interface EmailResult {
	success: boolean;
	id?: string;
	error?: string;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
	if (!privateEnv.RESEND_API_KEY) {
		console.error('[email] RESEND_API_KEY not configured — email not sent');
		return { success: false, error: 'Email service not configured' };
	}

	const fromEmail = privateEnv.RESEND_FROM_EMAIL || 'Skyler <skyler@skylersewingsecrets.com>';

	const payload = {
		from: fromEmail,
		to: Array.isArray(options.to) ? options.to : [options.to],
		subject: options.subject,
		html: options.html,
		text: options.text,
		reply_to: options.replyTo
	};

	try {
		console.error('[email] Sending to:', payload.to, 'from:', payload.from, 'subject:', payload.subject);

		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${privateEnv.RESEND_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		const data = await response.json();

		if (!response.ok) {
			console.error('[email] Resend API error:', response.status, JSON.stringify(data));
			return { success: false, error: data.message || 'Failed to send email' };
		}

		console.error('[email] Sent successfully, id:', data.id);
		return { success: true, id: data.id };
	} catch (error) {
		console.error('[email] Send error:', error);
		return { success: false, error: 'Failed to send email' };
	}
}

// Email templates

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
	const siteUrl = publicEnv.PUBLIC_SITE_URL || 'https://skylersewingsecrets.com';
	const safeName = escapeHtml(name);

	return {
		subject: "Welcome to Skyler's Sewing Secrets!",
		html: `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
				<div style="text-align: center; margin-bottom: 30px;">
					<img src="${siteUrl}/logo/logo.png" alt="Skyler's Sewing Secrets" style="max-width: 200px;">
				</div>
				
				<h1 style="color: #8B5A5A; margin-bottom: 20px;">Welcome, ${safeName}!</h1>
				
				<p>Thank you for joining Skyler's Sewing Secrets! You now have lifetime access to all our tutorials.</p>
				
				<p>Here's what you can do next:</p>
				
				<ul style="padding-left: 20px;">
					<li><strong>Start Learning:</strong> Head to your dashboard to begin with Module 1</li>
					<li><strong>Track Progress:</strong> Mark lessons as complete as you go</li>
					<li><strong>Download Resources:</strong> Access patterns and guides in each lesson</li>
				</ul>
				
				<div style="text-align: center; margin: 30px 0;">
					<a href="${siteUrl}/dashboard" style="display: inline-block; background-color: #8B5A5A; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Go to Dashboard</a>
				</div>
				
				<p>If you have any questions, don't hesitate to reach out. I'm here to help you succeed!</p>
				
				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>
				
				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
				
				<p style="font-size: 12px; color: #888; text-align: center;">
					Skyler's Sewing Secrets<br>
					<a href="${siteUrl}" style="color: #8B5A5A;">skylersewingsecrets.com</a>
				</p>
			</body>
			</html>
		`,
		text: `
Welcome, ${name}!

Thank you for joining Skyler's Sewing Secrets! You now have lifetime access to our complete sewing course.

Here's what you can do next:

- Start Learning: Head to your dashboard to begin with Module 1
- Track Progress: Mark lessons as complete as you go
- Download Resources: Access patterns and guides in each lesson

Go to Dashboard: ${siteUrl}/dashboard

If you have any questions, don't hesitate to reach out. I'm here to help you succeed!

Happy sewing!
Skyler

---
Skyler's Sewing Secrets
${siteUrl}
		`.trim()
	};
}

export function contactNotificationEmail(
	name: string,
	email: string,
	subject: string | null,
	message: string
): { subject: string; html: string; text: string } {
	const safeName = escapeHtml(name);
	const safeEmail = escapeHtml(email);
	const safeSubject = subject ? escapeHtml(subject) : null;
	const safeMessage = escapeHtml(message);

	return {
		subject: `New Contact Form Submission: ${subject || 'No Subject'}`,
		html: `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
			</head>
			<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
				<h2 style="color: #8B5A5A;">New Contact Form Submission</h2>

				<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
					<tr>
						<td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>From:</strong></td>
						<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safeName}</td>
					</tr>
					<tr>
						<td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Email:</strong></td>
						<td style="padding: 8px 0; border-bottom: 1px solid #eee;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
					</tr>
					<tr>
						<td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Subject:</strong></td>
						<td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safeSubject || '(No subject)'}</td>
					</tr>
				</table>

				<div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
					<strong>Message:</strong>
					<p style="white-space: pre-wrap;">${safeMessage}</p>
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

export function passwordResetEmail(resetUrl: string): { subject: string; html: string; text: string } {
	const siteUrl = publicEnv.PUBLIC_SITE_URL || 'https://skylersewingsecrets.com';
	
	return {
		subject: "Reset Your Password - Skyler's Sewing Secrets",
		html: `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
				<div style="text-align: center; margin-bottom: 30px;">
					<img src="${siteUrl}/logo/logo.png" alt="Skyler's Sewing Secrets" style="max-width: 200px;">
				</div>
				
				<h1 style="color: #8B5A5A; margin-bottom: 20px;">Reset Your Password</h1>
				
				<p>We received a request to reset your password. Click the button below to create a new password:</p>
				
				<div style="text-align: center; margin: 30px 0;">
					<a href="${resetUrl}" style="display: inline-block; background-color: #8B5A5A; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
				</div>
				
				<p>If you didn't request this, you can safely ignore this email. The link will expire in 1 hour.</p>
				
				<p>Best,<br>
				<strong>Skyler's Sewing Secrets</strong></p>
				
				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
				
				<p style="font-size: 12px; color: #888;">
					If the button doesn't work, copy and paste this link into your browser:<br>
					<a href="${resetUrl}" style="color: #8B5A5A; word-break: break-all;">${resetUrl}</a>
				</p>
			</body>
			</html>
		`,
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

export function newsletterWelcomeEmail(
	unsubscribeUrl: string
): { subject: string; html: string; text: string } {
	const siteUrl = publicEnv.PUBLIC_SITE_URL || 'https://skylersewingsecrets.com';
	const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);

	return {
		subject: "Welcome to Couture Notes - Skyler's Sewing Secrets",
		html: `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
				<div style="text-align: center; margin-bottom: 30px;">
					<img src="${siteUrl}/logo/logo.png" alt="Skyler's Sewing Secrets" style="max-width: 200px;">
				</div>

				<h1 style="color: #8B5A5A; margin-bottom: 20px;">Welcome to Couture Notes!</h1>

				<p>Thank you for subscribing! You'll receive practical insights from the workroom — tips, techniques, and inspiration to elevate your sewing.</p>

				<p>In the meantime, here are some things you might enjoy:</p>

				<ul style="padding-left: 20px;">
					<li><a href="${siteUrl}/blog" style="color: #8B5A5A;">Read the blog</a> — articles on sewing techniques and fabric care</li>
					<li><a href="${siteUrl}/modules" style="color: #8B5A5A;">Browse the course</a> — see what's inside Skyler's Sewing Secrets</li>
					<li><a href="${siteUrl}/fabric-library" style="color: #8B5A5A;">Explore the fabric library</a> — a visual guide to fabrics and their uses</li>
				</ul>

				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>

				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

				<p style="font-size: 12px; color: #888; text-align: center;">
					Skyler's Sewing Secrets<br>
					<a href="${siteUrl}" style="color: #8B5A5A;">skylersewingsecrets.com</a><br>
					<a href="${safeUnsubscribeUrl}" style="color: #888;">Unsubscribe</a>
				</p>
			</body>
			</html>
		`,
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

export function purchaseConfirmationEmail(
	name: string,
	amount: string
): { subject: string; html: string; text: string } {
	const siteUrl = publicEnv.PUBLIC_SITE_URL || 'https://skylersewingsecrets.com';
	const safeName = escapeHtml(name);

	return {
		subject: "Your Purchase Confirmation - Skyler's Sewing Secrets",
		html: `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
			<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
				<div style="text-align: center; margin-bottom: 30px;">
					<img src="${siteUrl}/logo/logo.png" alt="Skyler's Sewing Secrets" style="max-width: 200px;">
				</div>
				
				<h1 style="color: #8B5A5A; margin-bottom: 20px;">Thank You for Your Purchase!</h1>
				
				<p>Hi ${safeName},</p>
				
				<p>Your payment of <strong>${amount}</strong> has been successfully processed. You now have lifetime access to Skyler's Sewing Secrets!</p>
				
				<div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; margin: 20px 0;">
					<h3 style="margin-top: 0; color: #8B5A5A;">What's Included:</h3>
					<ul style="padding-left: 20px; margin-bottom: 0;">
						<li>7 comprehensive modules</li>
						<li>39 video lessons</li>
						<li>Bonus Chanel Skirt tutorial</li>
						<li>Lifetime access with future updates</li>
					</ul>
				</div>
				
				<div style="text-align: center; margin: 30px 0;">
					<a href="${siteUrl}/dashboard" style="display: inline-block; background-color: #8B5A5A; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Start Learning Now</a>
				</div>
				
				<p>If you have any questions, just reply to this email or visit our <a href="${siteUrl}/faq" style="color: #8B5A5A;">FAQ page</a>.</p>
				
				<p>Happy sewing!<br>
				<strong>Skyler</strong></p>
				
				<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
				
				<p style="font-size: 12px; color: #888; text-align: center;">
					This is a receipt for your records. Please keep it for your files.<br>
					<a href="${siteUrl}" style="color: #8B5A5A;">skylersewingsecrets.com</a>
				</p>
			</body>
			</html>
		`,
		text: `
Thank You for Your Purchase!

Hi ${name},

Your payment of ${amount} has been successfully processed. You now have lifetime access to Skyler's Sewing Secrets!

What's Included:
- 7 comprehensive modules
- 39 video lessons
- Bonus Chanel Skirt tutorial
- Lifetime access with future updates

Start Learning Now: ${siteUrl}/dashboard

If you have any questions, reply to this email or visit our FAQ page: ${siteUrl}/faq

Happy sewing!
Skyler

---
This is a receipt for your records.
skylersewingsecrets.com
		`.trim()
	};
}
