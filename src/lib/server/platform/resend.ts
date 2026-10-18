/**
 * Resend adapter over its HTTP API. Errors are thrown for the caller to
 * decide on; nothing here logs, so addresses never reach the logs.
 */

export interface MailMessage {
	to: string | string[];
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
}

export interface Mailer {
	send(message: MailMessage): Promise<{ id: string }>;
}

/** A failed send; carries the HTTP status and Resend's error name, never the payload. */
export class MailerError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'MailerError';
		this.status = status;
	}
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendMailerOptions {
	apiKey: string;
	/** Sender, e.g. `Skyler <skyler@skylersewingsecrets.com>`. */
	from: string;
	fetch: typeof fetch;
}

export function createResendMailer(options: ResendMailerOptions): Mailer {
	const { apiKey, from, fetch: fetchFn } = options;

	return {
		async send(message) {
			const response = await fetchFn(RESEND_ENDPOINT, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					from,
					to: Array.isArray(message.to) ? message.to : [message.to],
					subject: message.subject,
					html: message.html,
					text: message.text,
					reply_to: message.replyTo
				})
			});

			const data = (await response.json().catch(() => ({}))) as { id?: string; name?: string };
			if (!response.ok) {
				// Resend's `message` can echo the recipient, so only its error name is kept.
				const reason = data.name ? ` (${data.name})` : '';
				throw new MailerError(
					`Resend send failed with ${response.status}${reason}`,
					response.status
				);
			}
			if (!data.id) throw new MailerError('Resend response carried no message id', response.status);
			return { id: data.id };
		}
	};
}
