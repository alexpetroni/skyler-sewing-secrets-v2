import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createFakeLogger } from '#lib/server/platform/fakes/logger.ts';
import { createFakeTurnstile } from '#lib/server/platform/fakes/turnstile.ts';
import { createRequestLimiter } from '#lib/server/platform/request-limits.ts';
import { createScreen, SCREEN_RULES, type ScreenInput } from './screen.ts';

describe('createScreen', () => {
	const { db } = useTestDb();
	const START = new Date('2026-10-01T09:00:00.000Z');

	function setup(options: { turnstile?: ReturnType<typeof createFakeTurnstile> } = {}) {
		let clock = START;
		const { turnstile } = options;
		const log = createFakeLogger();
		const screen = createScreen({
			limiter: createRequestLimiter({ db: db(), now: () => clock }),
			log,
			verifyTurnstile: turnstile ? (token, ip) => turnstile.verify(token, ip) : undefined
		});
		return {
			screen,
			log,
			advance(ms: number) {
				clock = new Date(clock.getTime() + ms);
			}
		};
	}

	const input = (overrides: Partial<ScreenInput> = {}): ScreenInput => ({
		scope: 'contact',
		clientKey: 'contact:client-a',
		ip: '203.0.113.7',
		honeypot: '',
		turnstileToken: '',
		...overrides
	});

	it('limits newsletter to 10 and contact to 5 per hour', () => {
		expect(SCREEN_RULES).toEqual({
			newsletter: { max: 10, windowSeconds: 3600 },
			contact: { max: 5, windowSeconds: 3600 }
		});
	});

	it('passes until the limit, then rate-limits with the seconds left in the window', async () => {
		const { screen, advance } = setup();
		for (let i = 0; i < 5; i += 1) expect(await screen(input())).toEqual({ outcome: 'pass' });

		advance(10 * 60 * 1000);
		expect(await screen(input())).toEqual({ outcome: 'rate_limited', retryAfterSeconds: 3000 });
		// Another client has its own bucket.
		expect(await screen(input({ clientKey: 'contact:client-b' }))).toEqual({ outcome: 'pass' });

		advance(50 * 60 * 1000);
		expect(await screen(input())).toEqual({ outcome: 'pass' });
	});

	it('reports a filled honeypot without consulting Turnstile', async () => {
		const turnstile = createFakeTurnstile();
		const { screen } = setup({ turnstile });

		expect(await screen(input({ honeypot: 'https://spam.example' }))).toEqual({
			outcome: 'honeypot'
		});
		expect(turnstile.calls).toEqual([]);
	});

	it('skips Turnstile when not configured', async () => {
		const { screen } = setup();
		expect(await screen(input({ turnstileToken: '' }))).toEqual({ outcome: 'pass' });
	});

	it('checks the token and client address with Turnstile when configured', async () => {
		const turnstile = createFakeTurnstile(false);
		const { screen, log } = setup({ turnstile });

		expect(await screen(input({ turnstileToken: 'bad' }))).toEqual({
			outcome: 'challenge_failed'
		});
		turnstile.setResult(true);
		expect(await screen(input({ turnstileToken: 'good' }))).toEqual({ outcome: 'pass' });

		expect(turnstile.calls).toEqual([
			{ token: 'bad', ip: '203.0.113.7' },
			{ token: 'good', ip: '203.0.113.7' }
		]);
		// The address is handed to Turnstile, never logged.
		expect(JSON.stringify(log.entries)).not.toContain('203.0.113.7');
	});
});
