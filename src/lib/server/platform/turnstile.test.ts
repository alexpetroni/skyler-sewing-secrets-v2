import { describe, expect, it } from 'vitest';
import { createFakeTurnstile } from './fakes/turnstile.ts';
import { createTurnstileVerifier, TURNSTILE_VERIFY_ENDPOINT, TurnstileError } from './turnstile.ts';

function stubFetch(response: () => Response) {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchStub: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		return response();
	};
	return { fetch: fetchStub, calls };
}

describe('createTurnstileVerifier', () => {
	it('posts secret, token and client ip to siteverify and returns its verdict', async () => {
		const stub = stubFetch(() => Response.json({ success: true }));
		const verifier = createTurnstileVerifier({ secret: 'ts-secret', fetch: stub.fetch });

		expect(await verifier.verify('tok-123', '203.0.113.7')).toBe(true);
		expect(stub.calls).toHaveLength(1);
		const { url, init } = stub.calls[0];
		expect(url).toBe(TURNSTILE_VERIFY_ENDPOINT);
		expect(TURNSTILE_VERIFY_ENDPOINT).toBe(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify'
		);
		expect(init?.method).toBe('POST');
		const body = init?.body as URLSearchParams;
		expect(Object.fromEntries(body)).toEqual({
			secret: 'ts-secret',
			response: 'tok-123',
			remoteip: '203.0.113.7'
		});
	});

	it('returns false for a rejected token', async () => {
		const stub = stubFetch(() =>
			Response.json({ success: false, 'error-codes': ['invalid-input-response'] })
		);
		const verifier = createTurnstileVerifier({ secret: 'ts-secret', fetch: stub.fetch });
		expect(await verifier.verify('forged')).toBe(false);
		expect(Object.fromEntries(stub.calls[0].init?.body as URLSearchParams)).toEqual({
			secret: 'ts-secret',
			response: 'forged'
		});
	});

	it('refuses an empty token without calling Cloudflare', async () => {
		const stub = stubFetch(() => Response.json({ success: true }));
		const verifier = createTurnstileVerifier({ secret: 'ts-secret', fetch: stub.fetch });
		expect(await verifier.verify('')).toBe(false);
		expect(stub.calls).toHaveLength(0);
	});

	it('throws a TurnstileError when siteverify answers non-2xx', async () => {
		const stub = stubFetch(() => new Response('upstream down', { status: 502 }));
		const verifier = createTurnstileVerifier({ secret: 'ts-secret', fetch: stub.fetch });
		const err = await verifier.verify('tok').catch((error: unknown) => error);
		expect(err).toBeInstanceOf(TurnstileError);
		expect((err as TurnstileError).status).toBe(502);
	});
});

describe('createFakeTurnstile', () => {
	it('records calls and answers the scripted result', async () => {
		const fake = createFakeTurnstile();
		expect(await fake.verify('a', '127.0.0.1')).toBe(true);
		fake.setResult(false);
		expect(await fake.verify('b')).toBe(false);
		expect(fake.calls).toEqual([
			{ token: 'a', ip: '127.0.0.1' },
			{ token: 'b', ip: undefined }
		]);
	});
});
