import type { Mailer, MailMessage } from '../resend.ts';

export interface SentMail extends MailMessage {
	id: string;
}

export interface FakeMailer extends Mailer {
	/** Every message sent, in order. */
	readonly sent: SentMail[];
	/** The most recent message addressed to `email` (case-insensitive), if any. */
	lastTo(email: string): SentMail | undefined;
}

export function createFakeMailer(): FakeMailer {
	const sent: SentMail[] = [];

	return {
		sent,
		async send(message) {
			const id = `fake-mail-${String(sent.length + 1).padStart(4, '0')}`;
			sent.push({ ...message, id });
			return { id };
		},
		lastTo(email) {
			const wanted = email.toLowerCase();
			return sent.findLast((mail) =>
				(Array.isArray(mail.to) ? mail.to : [mail.to]).some((to) => to.toLowerCase() === wanted)
			);
		}
	};
}
