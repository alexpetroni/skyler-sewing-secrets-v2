import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { sendEmail, contactNotificationEmail } from '$lib/server/email';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { contact_submissions } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim() || '';
		const email = formData.get('email')?.toString().trim() || '';
		const subject = formData.get('subject')?.toString().trim() || '';
		const message = formData.get('message')?.toString().trim() || '';

		const errors: Record<string, string> = {};

		// Validate
		if (!name) {
			errors.name = 'Name is required';
		} else if (name.length > 200) {
			errors.name = 'Name must be 200 characters or fewer';
		}

		if (!email) {
			errors.email = 'Email is required';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errors.email = 'Please enter a valid email address';
		}

		if (subject.length > 200) {
			errors.subject = 'Subject must be 200 characters or fewer';
		}

		if (!message) {
			errors.message = 'Message is required';
		} else if (message.length < 10) {
			errors.message = 'Message must be at least 10 characters';
		} else if (message.length > 5000) {
			errors.message = 'Message must be 5000 characters or fewer';
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, {
				errors,
				values: { name, email, subject, message }
			});
		}

		// Save to database
		try {
			await db.insert(contact_submissions).values({
				name,
				email,
				subject: subject || null,
				message
			});
		} catch (err) {
			console.error('Failed to save contact submission:', err);
			return fail(500, {
				error: 'Failed to send message. Please try again later.',
				values: { name, email, subject, message }
			});
		}

		// Send email notification to contact email
		const contactEmail = env.CONTACT_EMAIL || env.ADMIN_EMAIL;
		if (contactEmail) {
			const emailContent = contactNotificationEmail(name, email, subject, message);
			await sendEmail({
				to: contactEmail,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text,
				replyTo: email
			});
		}

		return {
			success: true
		};
	}
};
