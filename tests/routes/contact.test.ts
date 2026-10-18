import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { createFakeTurnstile } from '../../src/lib/server/platform/fakes/turnstile.ts';
import { actions } from '../../src/routes/(marketing)/contact/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, TEST_CONTACT_EMAIL, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { contact_submissions } = schema;

type ActionEvent = Parameters<typeof actions.default>[0];

const VALID = {
	name: 'Jane Doe',
	email: 'jane@example.com',
	subject: 'Course question',
	message: 'Is the course suitable for beginners?'
};

describe('/contact action', () => {
	const { db } = useTestDb();
	let clock: Date;
	let services: TestServices;

	beforeEach(() => {
		clock = new Date('2026-10-01T09:00:00.000Z');
		services = createTestServices(db(), { now: () => clock });
	});

	function submit(fields: Record<string, string>, ip = '198.51.100.1') {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = fakeEvent({
			method: 'POST',
			url: '/contact',
			body,
			locals: { services, requestId: 'req-1' }
		});
		event.getClientAddress = () => ip;
		return actions.default(event as unknown as ActionEvent);
	}

	const rows = () => db().select().from(contact_submissions);

	it('stores a valid message and notifies the contact inbox', async () => {
		expect(await submit(VALID)).toEqual({ success: true });

		expect(await rows()).toMatchObject([{ ...VALID, is_read: false }]);
		expect(services.mailer.sent).toHaveLength(1);
		expect(services.mailer.sent[0]).toMatchObject({
			to: TEST_CONTACT_EMAIL,
			replyTo: 'jane@example.com'
		});
	});

	it('returns the legacy field errors with the submitted values', async () => {
		const result = await submit({
			name: 'x'.repeat(201),
			email: 'nope',
			subject: 's'.repeat(201),
			message: 'short'
		});

		if (!isActionFailure(result)) throw new Error('expected a failure');
		expect(result.status).toBe(400);
		expect(result.data).toMatchObject({
			errors: {
				name: 'Name must be 200 characters or fewer',
				email: 'Please enter a valid email address',
				subject: 'Subject must be 200 characters or fewer',
				message: 'Message must be at least 10 characters'
			},
			values: { email: 'nope', message: 'short' }
		});

		const missing = await submit({ message: 'm'.repeat(5001) });
		if (!isActionFailure(missing)) throw new Error('expected a failure');
		expect(missing.data).toMatchObject({
			errors: {
				name: 'Name is required',
				email: 'Email is required',
				message: 'Message must be 5000 characters or fewer'
			}
		});
		expect(await rows()).toEqual([]);
		expect(services.mailer.sent).toEqual([]);
	});

	it('pretends to accept a filled honeypot but stores and sends nothing', async () => {
		expect(await submit({ ...VALID, website: 'https://spam.example' })).toEqual({ success: true });

		expect(await rows()).toEqual([]);
		expect(services.mailer.sent).toEqual([]);
	});

	it('refuses the sixth message from one client within an hour with 429', async () => {
		for (let i = 0; i < 5; i += 1) expect(await submit(VALID)).toEqual({ success: true });

		const limited = await submit(VALID);

		if (!isActionFailure(limited)) throw new Error('expected a failure');
		expect(limited.status).toBe(429);
		expect(limited.data).toMatchObject({ error: 'Too many messages. Please try again later.' });
		expect(await rows()).toHaveLength(5);
		expect(services.mailer.sent).toHaveLength(5);

		expect(await submit(VALID, '198.51.100.2')).toEqual({ success: true });
		clock = new Date(clock.getTime() + 60 * 60 * 1000);
		expect(await submit(VALID)).toEqual({ success: true });
	});

	it('refuses a failed Turnstile challenge when configured', async () => {
		const turnstile = createFakeTurnstile(false);
		services = createTestServices(db(), { now: () => clock, turnstile });

		const result = await submit({ ...VALID, 'cf-turnstile-response': 'forged' });

		if (!isActionFailure(result)) throw new Error('expected a failure');
		expect(result.status).toBe(400);
		expect(turnstile.calls).toEqual([{ token: 'forged', ip: '198.51.100.1' }]);
		expect(await rows()).toEqual([]);
	});
});
