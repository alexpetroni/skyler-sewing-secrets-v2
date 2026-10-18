import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// $env/dynamic/private is frozen at config time under Vitest, so the secret
// must be mocked at module level before newsletter.ts is imported.
vi.mock('$env/dynamic/private', () => ({ env: { BETTER_AUTH_SECRET: 'test-secret' } }));

import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from './newsletter';

const HEX_64 = /^[0-9a-f]{64}$/;

describe('unsubscribeToken', () => {
	it('returns 64 lowercase hex characters', async () => {
		expect(await unsubscribeToken('a@b.c')).toMatch(HEX_64);
	});

	it('is deterministic (HMAC-SHA256 of the email keyed with the secret)', async () => {
		const first = await unsubscribeToken('a@b.c');
		const second = await unsubscribeToken('a@b.c');
		expect(second).toBe(first);
		expect(first).toBe(createHmac('sha256', 'test-secret').update('a@b.c').digest('hex'));
	});

	it('is case-insensitive in the email', async () => {
		expect(await unsubscribeToken('A@B.C')).toBe(await unsubscribeToken('a@b.c'));
	});
});

describe('verifyUnsubscribeToken', () => {
	it('round-trips a token minted for the same email', async () => {
		const token = await unsubscribeToken('a@b.c');
		expect(await verifyUnsubscribeToken('a@b.c', token)).toBe(true);
	});

	it('fails for a different email', async () => {
		const token = await unsubscribeToken('a@b.c');
		expect(await verifyUnsubscribeToken('x@b.c', token)).toBe(false);
	});

	it('fails for a tampered token', async () => {
		const token = await unsubscribeToken('a@b.c');
		const flipped = (token[0] === '0' ? '1' : '0') + token.slice(1);
		expect(await verifyUnsubscribeToken('a@b.c', flipped)).toBe(false);
	});
});

describe('unsubscribeUrl', () => {
	it('contains the URL-encoded email and the token', async () => {
		const email = 'first+last@example.com';
		const url = await unsubscribeUrl(email);
		expect(url).toContain(`email=${encodeURIComponent(email)}`);
		expect(url).toContain(`token=${await unsubscribeToken(email)}`);
	});
});
