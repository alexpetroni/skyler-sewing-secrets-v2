import type { mediaStatus } from '#lib/server/db/schema/media.ts';

/**
 * Bunny Stream adapter. Formulas (Bunny docs, verified 2026-09-06):
 *
 * - Embed view token: `token = sha256_hex(embedTokenKey + videoId + expires)`,
 *   `expires` in unix seconds, appended as `&token=…&expires=…`.
 * - TUS presigned upload: `AuthorizationSignature =
 *   sha256_hex(libraryId + apiKey + expirationTime + videoId)`.
 *
 * Keys never leave the server; the browser only sees signed URLs and tickets.
 */

export type MediaStatus = (typeof mediaStatus.enumValues)[number];

export interface BunnyRef {
	libraryId: string;
	videoId: string;
}

export interface BunnyVideo {
	videoId: string;
	title: string;
	lengthSeconds: number;
	status: MediaStatus;
	width: number | null;
	height: number | null;
	thumbnailUrl: string | null;
	/** ISO-8601 UTC timestamp, or null when Bunny gives none. */
	dateUploaded: string | null;
}

/** Everything `tus-js-client` needs to upload straight to Bunny. */
export interface UploadTicket {
	endpoint: string;
	videoId: string;
	libraryId: string;
	/** Unix seconds after which Bunny rejects the signature. */
	expiresAt: number;
	headers: {
		AuthorizationSignature: string;
		AuthorizationExpire: string;
		VideoId: string;
		LibraryId: string;
	};
}

export interface VideoHost {
	/** Always signed; `ttlSeconds` defaults to six hours. */
	embedUrl(ref: BunnyRef, ttlSeconds?: number): Promise<string>;
	listVideos(params: {
		page: number;
		perPage: number;
		search?: string;
	}): Promise<{ items: BunnyVideo[]; total: number }>;
	getVideo(videoId: string): Promise<BunnyVideo>;
	createVideo(title: string): Promise<{ videoId: string }>;
	uploadTicket(videoId: string, ttlSeconds: number): Promise<UploadTicket>;
	setThumbnail(videoId: string, thumbnailTime: number): Promise<void>;
	deleteVideo(videoId: string): Promise<void>;
}

/** A non-2xx answer from the Bunny API; `status` lets callers tell 404 from outages. */
export class VideoHostError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'VideoHostError';
		this.status = status;
	}
}

export const EMBED_BASE = 'https://iframe.mediadelivery.net/embed';
const EMBED_QUERY = 'autoplay=false&preload=true';
export const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const API_BASE = 'https://video.bunnycdn.com/library';
export const DEFAULT_EMBED_TTL_SECONDS = 6 * 60 * 60;

/** Parses a legacy `bunny:{libraryId}/{videoId}` reference; null when it is not one. */
export function parseBunnyRef(value: string | null | undefined): BunnyRef | null {
	const match = value?.match(/^bunny:(\d+)\/(.+)$/);
	return match ? { libraryId: match[1], videoId: match[2] } : null;
}

export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The signed iframe URL; shared by the real host and the fake. */
export async function signedEmbedUrl(
	ref: BunnyRef,
	embedTokenKey: string,
	expires: number
): Promise<string> {
	const token = await sha256Hex(`${embedTokenKey}${ref.videoId}${expires}`);
	return `${EMBED_BASE}/${ref.libraryId}/${ref.videoId}?${EMBED_QUERY}&token=${token}&expires=${expires}`;
}

/** Presigned TUS headers; shared by the real host and the fake. */
export async function signedUploadTicket(
	libraryId: string,
	apiKey: string,
	videoId: string,
	expiresAt: number
): Promise<UploadTicket> {
	const signature = await sha256Hex(`${libraryId}${apiKey}${expiresAt}${videoId}`);
	return {
		endpoint: TUS_ENDPOINT,
		videoId,
		libraryId,
		expiresAt,
		headers: {
			AuthorizationSignature: signature,
			AuthorizationExpire: String(expiresAt),
			VideoId: videoId,
			LibraryId: libraryId
		}
	};
}

/**
 * Bunny's numeric status: 0 created, 1 uploaded, 2 processing, 3 transcoding,
 * 4 finished, 5 error, 6 upload failed. Anything else is treated as still
 * processing so it is re-checked rather than published.
 */
export function mapBunnyStatus(status: number): MediaStatus {
	switch (status) {
		case 0:
			return 'uploading';
		case 4:
			return 'ready';
		case 5:
		case 6:
			return 'failed';
		default:
			return 'processing';
	}
}

/** The subset of Bunny's video object this adapter reads. */
export interface BunnyApiVideo {
	guid: string;
	title?: string | null;
	length?: number | null;
	status?: number | null;
	width?: number | null;
	height?: number | null;
	thumbnailFileName?: string | null;
	dateUploaded?: string | null;
}

interface BunnyApiVideoList {
	totalItems: number;
	items: BunnyApiVideo[];
}

/** Bunny returns UTC timestamps without a zone designator. */
function toIsoUtc(value: string | null | undefined): string | null {
	if (!value) return null;
	const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
	const date = new Date(hasZone ? value : `${value}Z`);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normaliseBunnyVideo(video: BunnyApiVideo, cdnHost: string): BunnyVideo {
	return {
		videoId: video.guid,
		title: video.title ?? '',
		lengthSeconds: video.length ?? 0,
		status: mapBunnyStatus(video.status ?? 0),
		width: video.width || null,
		height: video.height || null,
		thumbnailUrl: video.thumbnailFileName
			? `https://${cdnHost}/${video.guid}/${video.thumbnailFileName}`
			: null,
		dateUploaded: toIsoUtc(video.dateUploaded)
	};
}

export interface BunnyVideoHostOptions {
	libraryId: string;
	apiKey: string;
	/** Required: unsigned embeds are never produced (fail closed). */
	embedTokenKey: string;
	/** Stream pull-zone host, e.g. `vz-abc123.b-cdn.net`. */
	cdnHost: string;
	fetch: typeof fetch;
	/** Clock in milliseconds; injectable for tests. */
	now?: () => number;
}

export function createBunnyVideoHost(options: BunnyVideoHostOptions): VideoHost {
	const { libraryId, apiKey, embedTokenKey, cdnHost, fetch: fetchFn, now = Date.now } = options;
	if (!embedTokenKey) {
		throw new Error('Bunny embed token key is required: refusing to serve unsigned embeds');
	}

	const nowSeconds = () => Math.floor(now() / 1000);

	async function call(method: string, path: string, body?: unknown): Promise<Response> {
		const response = await fetchFn(`${API_BASE}/${libraryId}${path}`, {
			method,
			headers: {
				AccessKey: apiKey,
				accept: 'application/json',
				...(body === undefined ? {} : { 'content-type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (!response.ok) {
			throw new VideoHostError(
				`Bunny ${method} ${path} failed with ${response.status}`,
				response.status
			);
		}
		return response;
	}

	const videoPath = (videoId: string) => `/videos/${encodeURIComponent(videoId)}`;

	return {
		embedUrl: (ref, ttlSeconds = DEFAULT_EMBED_TTL_SECONDS) =>
			signedEmbedUrl(ref, embedTokenKey, nowSeconds() + ttlSeconds),

		async listVideos({ page, perPage, search }) {
			const query = new URLSearchParams({
				page: String(page),
				itemsPerPage: String(perPage),
				orderBy: 'date'
			});
			if (search) query.set('search', search);
			const response = await call('GET', `/videos?${query}`);
			const data = (await response.json()) as BunnyApiVideoList;
			return {
				items: data.items.map((video) => normaliseBunnyVideo(video, cdnHost)),
				total: data.totalItems
			};
		},

		async getVideo(videoId) {
			const response = await call('GET', videoPath(videoId));
			return normaliseBunnyVideo((await response.json()) as BunnyApiVideo, cdnHost);
		},

		async createVideo(title) {
			const response = await call('POST', '/videos', { title });
			const data = (await response.json()) as BunnyApiVideo;
			return { videoId: data.guid };
		},

		uploadTicket: (videoId, ttlSeconds) =>
			signedUploadTicket(libraryId, apiKey, videoId, nowSeconds() + ttlSeconds),

		async setThumbnail(videoId, thumbnailTime) {
			const query = new URLSearchParams({ thumbnailTime: String(thumbnailTime) });
			await call('POST', `${videoPath(videoId)}/thumbnail?${query}`);
		},

		async deleteVideo(videoId) {
			await call('DELETE', videoPath(videoId));
		}
	};
}
