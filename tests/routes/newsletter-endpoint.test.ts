import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { createFakeTurnstile } from '../../src/lib/server/platform/fakes/turnstile.ts';
import { POST } from '../../src/routes/api/newsletter/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { fakeEvent } from '../helpers/event.ts';
import { createTestServices, type TestServices } from '../helpers/services.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { newsletter_subscribers } = schema;

type PostEvent = Parameters<typeof POST>[0];

const ACCEPTED = 'Please check your inbox to confirm your subscription.';

describe('POST /api/newsletter', () => {
	const { db } = useTestDb();
	let clock: Date;
	let services: TestServices;

	beforeEach(() => {
		clock = new Date('2026-10-01T09:00:00.000Z');
		services = createTestServices(db(), { now: () => clock });
	});

	async function post(
		fields: Record<string, string>,
		ip = '198.51.100.1'
	): Promise<{ status: number; headers: Headers; body: Record<string, unknown> }> {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = fakeEvent({
			method: 'POST',
			url: '/api/newsletter',
			body,
			locals: { services, requestId: 'req-1' },
			clientAddress: ip
		});
		const response = await POST(event as unknown as PostEvent);
		return {
			status: response.status,
			headers: response.headers,
			body: (await response.json()) as Record<string, unknown>
		};
	}

	const rows = () => db().select().from(newsletter_subscribers);

	it('accepts a valid address: pending row, one confirmation mail, uniform answer', async () => {
		const result = await post({ email: 'Reader@Example.com' });

		expect(result).toMatchObject({ status: 200, body: { ok: true, message: ACCEPTED } });
		expect(await rows()).toMatchObject([
			{ email: 'reader@example.com', is_active: false, confirmed_at: null }
		]);
		expect(services.mailer.sent).toHaveLength(1);
		expect(services.mailer.sent[0].to).toBe('reader@example.com');
		expect(JSON.stringify(services.logEntries)).not.toContain('reader@example.com');
	});

	it('returns 429 with Retry-After after 10 requests from one client within an hour', async () => {
		for (let i = 0; i < 10; i += 1) {
			expect((await post({ email: `reader${i}@example.com` })).status).toBe(200);
		}
		clock = new Date(clock.getTime() + 15 * 60 * 1000);

		const limited = await post({ email: 'eleventh@example.com' });

		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).toBe(String(45 * 60));
		expect(limited.body).toEqual({
			ok: false,
			error: 'Too many requests. Please try again later.'
		});
		expect(await rows()).toHaveLength(10);
		expect(services.mailer.sent).toHaveLength(10);

		// Another client is unaffected; the same client is let in once the hour is over.
		expect((await post({ email: 'other@example.com' }, '198.51.100.2')).status).toBe(200);
		clock = new Date(clock.getTime() + 45 * 60 * 1000);
		expect((await post({ email: 'eleventh@example.com' })).status).toBe(200);
	});

	it('answers a filled honeypot with 200 and creates no row and sends no mail', async () => {
		const result = await post({ email: 'bot@example.com', website: 'https://spam.example' });

		expect(result).toMatchObject({ status: 200, body: { ok: true, message: ACCEPTED } });
		expect(await rows()).toEqual([]);
		expect(services.mailer.sent).toEqual([]);
	});

	it('rejects a missing or malformed address with 400', async () => {
		expect(await post({ email: 'not-an-email' })).toMatchObject({
			status: 400,
			body: { ok: false, error: 'Please enter a valid email address' }
		});
		expect(await post({})).toMatchObject({
			status: 400,
			body: { ok: false, error: 'Email is required' }
		});
		expect(await rows()).toEqual([]);
		expect(services.mailer.sent).toEqual([]);
	});

	it('rejects a non-form body with 400', async () => {
		const event = fakeEvent({
			method: 'POST',
			url: '/api/newsletter',
			headers: { 'content-type': 'application/json' },
			body: '{"email":"a@b.c"}',
			locals: { services, requestId: 'req-1' }
		});
		const response = await POST(event as unknown as PostEvent);
		expect(response.status).toBe(400);
		expect(await rows()).toEqual([]);
	});

	it('gives the same answer for an address that is already confirmed, without mail', async () => {
		await db().insert(newsletter_subscribers).values({
			email: 'reader@example.com',
			is_active: true,
			confirmed_at: '2026-09-01T00:00:00Z'
		});

		expect(await post({ email: 'reader@example.com' })).toMatchObject({
			status: 200,
			body: { ok: true, message: ACCEPTED }
		});
		expect(services.mailer.sent).toEqual([]);
	});

	describe('with Turnstile configured', () => {
		it('returns 400 and does nothing when the challenge fails', async () => {
			const turnstile = createFakeTurnstile(false);
			services = createTestServices(db(), { now: () => clock, turnstile });

			const result = await post({ email: 'reader@example.com', 'cf-turnstile-response': 'forged' });

			expect(result).toMatchObject({
				status: 400,
				body: { ok: false, error: 'Please complete the verification and try again.' }
			});
			expect(turnstile.calls).toEqual([{ token: 'forged', ip: '198.51.100.1' }]);
			expect(await rows()).toEqual([]);
			expect(services.mailer.sent).toEqual([]);
		});

		it('subscribes when the challenge passes', async () => {
			const turnstile = createFakeTurnstile(true);
			services = createTestServices(db(), { now: () => clock, turnstile });

			const result = await post({ email: 'reader@example.com', 'cf-turnstile-response': 'ok' });

			expect(result.status).toBe(200);
			expect(await rows()).toHaveLength(1);
		});
	});
});
