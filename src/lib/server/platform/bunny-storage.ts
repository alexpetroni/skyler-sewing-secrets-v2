import type { Logger } from './logger.ts';

/**
 * Bunny Storage + CDN token authentication. Formulas (Bunny docs, verified
 * 2026-10-18):
 *
 * - Storage API: `PUT|DELETE https://storage.bunnycdn.com/{zone}/{path}` with
 *   the zone password in the `AccessKey` header.
 * - CDN token (pull zone "Token Authentication"):
 *   `token = base64url(sha256(key + '/' + path + expires))` with the padding
 *   stripped, appended as `?token=…&expires=<unix seconds>`.
 *
 * The keys never leave the server; the browser sees signed URLs only.
 */
export interface BunnyStorage {
	/** Public base URL of the pull zone, without a trailing slash. */
	readonly cdnUrl: string;
	/** Stores the bytes under `path` (no leading slash) and returns the plain CDN URL. */
	put(path: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<string>;
	delete(path: string): Promise<void>;
	/**
	 * The CDN URL of `path` with a token valid for `ttlSeconds`. Without a
	 * token key configured it is the plain URL (and a warning is logged once).
	 */
	signedUrl(path: string, ttlSeconds: number): Promise<string>;
	/** A URL on this CDN is signed with `ttlSeconds`; any other URL is returned unchanged. */
	downloadUrl(url: string, ttlSeconds: number): Promise<string>;
}

export class StorageError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'StorageError';
		this.status = status;
	}
}

export const STORAGE_API_BASE = 'https://storage.bunnycdn.com';

function normalisePath(path: string): string {
	return path.replace(/^\/+/, '');
}

function base64Url(bytes: ArrayBuffer): string {
	return Buffer.from(bytes)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/** The signed CDN URL; shared by the real adapter and the fake. */
export async function signedStorageUrl(
	cdnUrl: string,
	tokenKey: string,
	path: string,
	expires: number
): Promise<string> {
	const signedPath = `/${normalisePath(path)}`;
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${tokenKey}${signedPath}${expires}`)
	);
	return `${cdnUrl}${signedPath}?token=${base64Url(digest)}&expires=${expires}`;
}

/** The storage path of a URL on the pull zone, or null when it is elsewhere. */
export function storagePathOf(cdnUrl: string, url: string): string | null {
	const base = cdnUrl.replace(/\/+$/, '');
	if (!url.startsWith(`${base}/`)) return null;
	const rest = url.slice(base.length + 1);
	const path = rest.split(/[?#]/)[0];
	return path ? decodeURIComponent(path) : null;
}

export interface BunnyStorageOptions {
	zone: string;
	apiKey: string;
	cdnUrl: string;
	/** Pull zone token authentication key; absent means unsigned URLs. */
	tokenKey?: string;
	fetch: typeof fetch;
	log: Logger;
	/** Clock in milliseconds; injectable for tests. */
	now?: () => number;
}

export function createBunnyStorage(options: BunnyStorageOptions): BunnyStorage {
	const { zone, apiKey, tokenKey, fetch: fetchFn, log, now = Date.now } = options;
	const cdnUrl = options.cdnUrl.replace(/\/+$/, '');
	let warnedUnsigned = false;

	async function call(method: 'PUT' | 'DELETE', path: string, init: RequestInit = {}) {
		const response = await fetchFn(`${STORAGE_API_BASE}/${zone}/${normalisePath(path)}`, {
			method,
			...init,
			headers: { AccessKey: apiKey, ...(init.headers ?? {}) }
		});
		if (!response.ok) {
			throw new StorageError(
				`Bunny Storage ${method} ${path} failed with ${response.status}`,
				response.status
			);
		}
	}

	const storage: BunnyStorage = {
		cdnUrl,

		async put(path, bytes, contentType) {
			await call('PUT', path, {
				headers: { 'content-type': contentType },
				body: bytes
			});
			return `${cdnUrl}/${normalisePath(path)}`;
		},

		async delete(path) {
			await call('DELETE', path);
		},

		async signedUrl(path, ttlSeconds) {
			if (!tokenKey) {
				if (!warnedUnsigned) {
					warnedUnsigned = true;
					log.warn('BUNNY_CDN_TOKEN_KEY is not set: storage URLs are served unsigned');
				}
				return `${cdnUrl}/${normalisePath(path)}`;
			}
			return signedStorageUrl(cdnUrl, tokenKey, path, Math.floor(now() / 1000) + ttlSeconds);
		},

		async downloadUrl(url, ttlSeconds) {
			const path = storagePathOf(cdnUrl, url);
			return path ? storage.signedUrl(path, ttlSeconds) : url;
		}
	};
	return storage;
}
