import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
// @ts-expect-error -- internal export: the request store `sequence()` runs inside
import { with_request_store } from '@sveltejs/kit/internal/server';

export interface FakeEventOptions {
	method?: string;
	/** Absolute URL or a path resolved against `http://localhost:5173`. */
	url?: string;
	headers?: Record<string, string>;
	body?: BodyInit | null;
	locals?: Partial<App.Locals>;
	isDataRequest?: boolean;
}

export interface SetCookieCall {
	name: string;
	value: string;
	options: Parameters<Cookies['set']>[2];
}

export interface FakeEvent extends RequestEvent {
	/** Every `cookies.set` call made while handling the request. */
	setCookies: SetCookieCall[];
	/** Response headers requested through `setHeaders`. */
	responseHeaders: Record<string, string>;
}

export const FAKE_ORIGIN = 'http://localhost:5173';

/**
 * A `RequestEvent` for hook, load and action tests. Cookies sent in the
 * `cookie` header are readable through `cookies.get`; cookies set during the
 * request are recorded on `setCookies` and become readable too.
 */
export function fakeEvent(options: FakeEventOptions = {}): FakeEvent {
	const url = new URL(options.url ?? '/', FAKE_ORIGIN);
	const request = new Request(url, {
		method: options.method ?? 'GET',
		headers: options.headers,
		body: options.body ?? undefined
	});

	const jar = new Map<string, string>();
	for (const pair of (request.headers.get('cookie') ?? '').split(';')) {
		const [name, ...rest] = pair.trim().split('=');
		if (name) jar.set(name, decodeURIComponent(rest.join('=')));
	}
	const setCookies: SetCookieCall[] = [];
	const responseHeaders: Record<string, string> = {};

	const cookies: Cookies = {
		get: (name) => jar.get(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: (name, value, opts) => {
			jar.set(name, value);
			setCookies.push({ name, value, options: opts });
		},
		delete: (name, opts) => {
			jar.delete(name);
			setCookies.push({ name, value: '', options: { ...opts, maxAge: 0 } });
		},
		serialize: (name, value) => `${name}=${encodeURIComponent(value)}`,
		parse: ((setCookie: string) => {
			const [pair, ...attributes] = setCookie.split(';');
			const [name, ...rest] = pair.trim().split('=');
			return {
				name,
				value: decodeURIComponent(rest.join('=')),
				...Object.fromEntries(
					attributes.map((attribute) => {
						const [key, ...v] = attribute.trim().split('=');
						return [key.toLowerCase(), v.length ? v.join('=') : true];
					})
				)
			};
		}) as Cookies['parse']
	};

	const event = {
		request,
		url,
		cookies,
		locals: { ...options.locals } as App.Locals,
		params: {},
		route: { id: null },
		platform: undefined,
		isDataRequest: options.isDataRequest ?? false,
		isSubRequest: false,
		isRemoteRequest: false,
		fetch: globalThis.fetch,
		getClientAddress: () => '127.0.0.1',
		setHeaders: (headers: Record<string, string>) => {
			Object.assign(responseHeaders, headers);
		},
		setCookies,
		responseHeaders
	};

	return event as unknown as FakeEvent;
}

/**
 * Runs a `Handle` the way SvelteKit does: inside a request store, which
 * `sequence()` from `@sveltejs/kit/hooks` requires.
 */
export function runHandle(
	handle: Handle,
	event: RequestEvent,
	resolve: (event: RequestEvent) => Promise<Response>
): Promise<Response> {
	return with_request_store({ event, state: {} }, () => handle({ event, resolve }));
}
