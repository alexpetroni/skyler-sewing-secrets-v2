import { describe, expect, it } from 'vitest';
import { createFakeLogger } from './fakes/logger.ts';
import { createRevalidator, REVALIDATE_HEADER } from './revalidate.ts';

function stubFetch(response: () => Response) {
	const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
	const fetchStub: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init });
		return response();
	};
	return { fetch: fetchStub, calls };
}

describe('createRevalidator', () => {
	it('does nothing without a bypass token or a site URL', async () => {
		const stub = stubFetch(() => new Response(null));
		const log = createFakeLogger();
		await createRevalidator({ siteUrl: 'https://x.test', fetch: stub.fetch, log }).revalidate([
			'/catalogue'
		]);
		await createRevalidator({ bypassToken: 'tok', fetch: stub.fetch, log }).revalidate([
			'/catalogue'
		]);
		expect(stub.calls).toEqual([]);
	});

	it('requests each path on the site with the bypass header', async () => {
		const stub = stubFetch(() => new Response(null));
		const revalidator = createRevalidator({
			bypassToken: 'bypass-token',
			siteUrl: 'https://www.example.test',
			fetch: stub.fetch,
			log: createFakeLogger()
		});
		await revalidator.revalidate(['/catalogue', '/products/zips']);
		expect(stub.calls.map((call) => call.url)).toEqual([
			'https://www.example.test/catalogue',
			'https://www.example.test/products/zips'
		]);
		expect(stub.calls[0].init?.method).toBe('HEAD');
		expect(stub.calls[0].init?.headers).toEqual({ [REVALIDATE_HEADER]: 'bypass-token' });
	});

	it('logs a refused or failed request instead of throwing', async () => {
		const log = createFakeLogger();
		const refused = createRevalidator({
			bypassToken: 'tok',
			siteUrl: 'https://x.test',
			fetch: stubFetch(() => new Response(null, { status: 403 })).fetch,
			log
		});
		await refused.revalidate(['/catalogue']);
		const failing = createRevalidator({
			bypassToken: 'tok',
			siteUrl: 'https://x.test',
			fetch: async () => {
				throw new Error('offline');
			},
			log
		});
		await failing.revalidate(['/catalogue']);
		expect(log.entries).toEqual([
			{
				level: 'warn',
				message: 'revalidation refused',
				fields: { path: '/catalogue', status: 403 }
			},
			{
				level: 'warn',
				message: 'revalidation failed',
				fields: { path: '/catalogue', error: 'offline' }
			}
		]);
	});
});
