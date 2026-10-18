import { signedStorageUrl, storagePathOf, type BunnyStorage } from '../bunny-storage.ts';

export interface StoredFile {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
}

export interface FakeStorage extends BunnyStorage {
	/** Everything stored, keyed by path. */
	readonly files: Map<string, StoredFile>;
	readonly tokenKey: string;
}

export interface FakeStorageOptions {
	cdnUrl?: string;
	tokenKey?: string;
	/** Clock in milliseconds. */
	now?: () => number;
}

/** In-memory Bunny Storage; URLs are signed with the same formula as the real adapter. */
export function createFakeStorage(options: FakeStorageOptions = {}): FakeStorage {
	const {
		cdnUrl = 'https://cdn.example.test',
		tokenKey = 'fake-cdn-token-key',
		now = Date.now
	} = options;
	const files = new Map<string, StoredFile>();

	const storage: FakeStorage = {
		cdnUrl,
		tokenKey,
		files,
		async put(path, bytes, contentType) {
			files.set(path, { bytes, contentType });
			return `${cdnUrl}/${path}`;
		},
		async delete(path) {
			files.delete(path);
		},
		signedUrl(path, ttlSeconds) {
			return signedStorageUrl(cdnUrl, tokenKey, path, Math.floor(now() / 1000) + ttlSeconds);
		},
		async downloadUrl(url, ttlSeconds) {
			const path = storagePathOf(cdnUrl, url);
			return path ? storage.signedUrl(path, ttlSeconds) : url;
		}
	};
	return storage;
}
