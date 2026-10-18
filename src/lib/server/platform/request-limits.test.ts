import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { request_limits } from '#lib/server/db/schema/ops.ts';
import { useTestDb } from '../../../../tests/helpers/db.ts';
import { createRequestLimiter, keyFor } from './request-limits.ts';

const { db } = useTestDb();

/** A clock the test moves by hand. */
function manualClock(start: string) {
	let current = new Date(start).getTime();
	return {
		now: () => new Date(current),
		advance: (seconds: number) => {
			current += seconds * 1000;
		}
	};
}

const RULE = { max: 3, windowSeconds: 60 };

describe('createRequestLimiter (PGlite)', () => {
	it('allows up to max requests in a window, then denies', async () => {
		const clock = manualClock('2026-10-18T09:00:00.000Z');
		const limiter = createRequestLimiter({ db: db(), now: clock.now });

		const results = [];
		for (let i = 0; i < 3; i++) results.push(await limiter.consume('contact:abc', RULE));
		expect(results).toEqual([
			{ allowed: true, remaining: 2, retryAfterSeconds: 0 },
			{ allowed: true, remaining: 1, retryAfterSeconds: 0 },
			{ allowed: true, remaining: 0, retryAfterSeconds: 0 }
		]);

		clock.advance(15);
		expect(await limiter.consume('contact:abc', RULE)).toEqual({
			allowed: false,
			remaining: 0,
			retryAfterSeconds: 45
		});
		clock.advance(10);
		expect(await limiter.consume('contact:abc', RULE)).toEqual({
			allowed: false,
			remaining: 0,
			retryAfterSeconds: 35
		});

		const [row] = await db()
			.select()
			.from(request_limits)
			.where(eq(request_limits.key, 'contact:abc'));
		expect(row.count).toBe(5);
	});

	it('resets the window once it is older than windowSeconds', async () => {
		const clock = manualClock('2026-10-18T09:00:00.000Z');
		const limiter = createRequestLimiter({ db: db(), now: clock.now });
		for (let i = 0; i < 4; i++) await limiter.consume('promo:abc', RULE);
		expect((await limiter.consume('promo:abc', RULE)).allowed).toBe(false);

		clock.advance(59);
		expect((await limiter.consume('promo:abc', RULE)).allowed).toBe(false);

		clock.advance(1);
		expect(await limiter.consume('promo:abc', RULE)).toEqual({
			allowed: true,
			remaining: 2,
			retryAfterSeconds: 0
		});
		const [row] = await db()
			.select()
			.from(request_limits)
			.where(eq(request_limits.key, 'promo:abc'));
		expect(row.count).toBe(1);
		expect(new Date(row.window_start).toISOString()).toBe('2026-10-18T09:01:00.000Z');
	});

	it('counts keys independently (sequential calls: PGlite is single-connection)', async () => {
		const clock = manualClock('2026-10-18T09:00:00.000Z');
		const limiter = createRequestLimiter({ db: db(), now: clock.now });
		const rule = { max: 1, windowSeconds: 60 };

		expect((await limiter.consume('a', rule)).allowed).toBe(true);
		expect((await limiter.consume('a', rule)).allowed).toBe(false);
		expect((await limiter.consume('b', rule)).allowed).toBe(true);
	});
});

describe('keyFor', () => {
	it('prefixes the sha256 of the client address and never stores the raw IP', () => {
		const key = keyFor('contact', { getClientAddress: () => '203.0.113.7' });
		expect(key).toBe('contact:' + createHash('sha256').update('203.0.113.7').digest('hex'));
		expect(key).not.toContain('203.0.113.7');
	});

	it('separates scopes for the same client', () => {
		const event = { getClientAddress: () => '203.0.113.7' };
		expect(keyFor('contact', event)).not.toBe(keyFor('promo', event));
	});

	it('falls back to a shared bucket when the address is unavailable', () => {
		const key = keyFor('contact', {
			getClientAddress: () => {
				throw new Error('no address');
			}
		});
		expect(key).toBe('contact:' + createHash('sha256').update('unknown').digest('hex'));
	});
});
