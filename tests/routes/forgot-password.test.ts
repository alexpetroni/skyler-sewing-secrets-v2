import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions } from '../../src/routes/(auth)/auth/forgot-password/+page.server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

type ActionEvent = Parameters<typeof actions.default>[0];

const EMAIL = 'member@example.com';

describe('/auth/forgot-password', () => {
	const { db } = useTestDb();
	let services: TestServices;

	beforeEach(async () => {
		services = createTestServices(db());
		await services.users.createCredentialUser({ email: EMAIL, password: 'a-good-password' });
	});

	function submit(email: string, clientAddress?: string) {
		const body = new FormData();
		body.set('email', email);
		const event = fakeEvent({
			method: 'POST',
			url: '/auth/forgot-password',
			body,
			clientAddress,
			locals: { services, requestId: 'req-1' }
		});
		return actions.default(event as unknown as ActionEvent);
	}

	it('sends the reset email and answers the same for unknown addresses', async () => {
		expect(await submit(EMAIL)).toEqual({ success: true });
		expect(services.resetEmails.map((mail) => mail.to)).toEqual([EMAIL]);

		expect(await submit('unknown@example.com')).toEqual({ success: true });
		expect(services.resetEmails).toHaveLength(1);

		const invalid = await submit('not-an-email');
		if (!isActionFailure(invalid)) throw new Error('expected a failure');
		expect(invalid.status).toBe(400);
	});

	it('answers 429 to the sixth request from one address within 15 minutes', async () => {
		for (let attempt = 1; attempt <= 5; attempt++) {
			expect(await submit(EMAIL)).toEqual({ success: true });
		}
		const sixth = await submit(EMAIL);
		if (!isActionFailure(sixth)) throw new Error('expected a failure');
		expect(sixth.status).toBe(429);
		expect(sixth.data).toEqual({
			email: EMAIL,
			error: 'Too many reset requests. Please wait a few minutes and try again.'
		});
		expect(services.resetEmails).toHaveLength(5);

		// Another address is still served.
		expect(await submit(EMAIL, '10.0.0.2')).toEqual({ success: true });
		expect(services.resetEmails).toHaveLength(6);
	});
});
