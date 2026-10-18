import { describe, expect, it } from 'vitest';
import { createFakeMailer } from './fakes/mailer.ts';
import { createResendMailer, MailerError, RESEND_ENDPOINT } from './resend.ts';

function stubFetch(response: () => Response) {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchStub: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		return response();
	};
	return { fetch: fetchStub, calls };
}

const message = {
	to: 'jane@example.com',
	subject: 'Hello',
	html: '<p>Hi</p>',
	text: 'Hi',
	replyTo: 'skyler@example.com'
};

describe('createResendMailer', () => {
	it('posts the legacy payload with the bearer key and returns the id', async () => {
		const stub = stubFetch(() => Response.json({ id: 'email_123' }));
		const mailer = createResendMailer({
			apiKey: 're_key',
			from: 'Skyler <skyler@skylersewingsecrets.com>',
			fetch: stub.fetch
		});

		expect(await mailer.send(message)).toEqual({ id: 'email_123' });
		expect(stub.calls).toHaveLength(1);
		const { url, init } = stub.calls[0];
		expect(url).toBe(RESEND_ENDPOINT);
		expect(RESEND_ENDPOINT).toBe('https://api.resend.com/emails');
		expect(init?.method).toBe('POST');
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer re_key');
		expect(JSON.parse(String(init?.body))).toEqual({
			from: 'Skyler <skyler@skylersewingsecrets.com>',
			to: ['jane@example.com'],
			subject: 'Hello',
			html: '<p>Hi</p>',
			text: 'Hi',
			reply_to: 'skyler@example.com'
		});
	});

	it('throws a MailerError with the status and without the recipient on failure', async () => {
		const stub = stubFetch(() =>
			Response.json(
				{ statusCode: 422, name: 'validation_error', message: 'Invalid `to`: jane@example.com' },
				{ status: 422 }
			)
		);
		const mailer = createResendMailer({ apiKey: 'k', from: 'f@example.com', fetch: stub.fetch });

		const error = await mailer.send(message).catch((err: unknown) => err);
		expect(error).toBeInstanceOf(MailerError);
		expect((error as MailerError).status).toBe(422);
		expect((error as MailerError).message).toContain('validation_error');
		expect((error as MailerError).message).not.toContain('jane@example.com');
	});

	it('throws when the response body is not JSON', async () => {
		const stub = stubFetch(() => new Response('Bad gateway', { status: 502 }));
		const mailer = createResendMailer({ apiKey: 'k', from: 'f@example.com', fetch: stub.fetch });
		await expect(mailer.send(message)).rejects.toThrow(/502/);
	});
});

describe('createFakeMailer', () => {
	it('collects messages and finds the last one sent to an address', async () => {
		const mailer = createFakeMailer();
		await mailer.send({ ...message, subject: 'First' });
		await mailer.send({ ...message, to: ['other@example.com'], subject: 'Other' });
		const last = await mailer.send({
			...message,
			to: ['x@example.com', 'Jane@Example.com'],
			subject: 'Second'
		});

		expect(mailer.sent.map((mail) => mail.subject)).toEqual(['First', 'Other', 'Second']);
		expect(mailer.lastTo('jane@example.com')).toMatchObject({ id: last.id, subject: 'Second' });
		expect(mailer.lastTo('nobody@example.com')).toBeUndefined();
	});
});
