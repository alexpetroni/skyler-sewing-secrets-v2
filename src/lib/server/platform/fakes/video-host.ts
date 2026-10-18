import {
	DEFAULT_EMBED_TTL_SECONDS,
	signedEmbedUrl,
	signedUploadTicket,
	VideoHostError,
	type BunnyVideo,
	type VideoHost
} from '../bunny.ts';

export interface FakeVideoHost extends VideoHost {
	/** The in-memory library, keyed by video id. */
	readonly videos: Map<string, BunnyVideo>;
	/** Thumbnail times requested through `setThumbnail`, keyed by video id. */
	readonly thumbnailTimes: Map<string, number>;
	/** Simulates Bunny finishing the encode: status `ready` with length, size and thumbnail. */
	finishEncoding(videoId: string, details?: Partial<Omit<BunnyVideo, 'videoId'>>): BunnyVideo;
}

export interface FakeVideoHostOptions {
	libraryId?: string;
	embedTokenKey?: string;
	apiKey?: string;
	/** Clock in milliseconds. */
	now?: () => number;
}

/**
 * In-memory Bunny library. Ids are deterministic (`fake-video-0001`, …);
 * embed URLs and upload tickets are signed with the same formulas as the real
 * host, using the fake keys.
 */
export function createFakeVideoHost(options: FakeVideoHostOptions = {}): FakeVideoHost {
	const {
		libraryId = '100',
		embedTokenKey = 'fake-embed-key',
		apiKey = 'fake-api-key',
		now = Date.now
	} = options;
	const videos = new Map<string, BunnyVideo>();
	const thumbnailTimes = new Map<string, number>();
	let sequence = 0;
	const nowSeconds = () => Math.floor(now() / 1000);

	const find = (videoId: string): BunnyVideo => {
		const video = videos.get(videoId);
		if (!video) throw new VideoHostError(`fake Bunny video ${videoId} not found`, 404);
		return video;
	};

	return {
		libraryId,
		videos,
		thumbnailTimes,

		embedUrl: (ref, ttlSeconds = DEFAULT_EMBED_TTL_SECONDS) =>
			signedEmbedUrl(ref, embedTokenKey, nowSeconds() + ttlSeconds),

		async listVideos({ page, perPage, search }) {
			const needle = search?.toLowerCase();
			const matching = [...videos.values()]
				.filter((video) => !needle || video.title.toLowerCase().includes(needle))
				.reverse();
			const start = (page - 1) * perPage;
			return {
				items: matching.slice(start, start + perPage).map((video) => ({ ...video })),
				total: matching.length
			};
		},

		async getVideo(videoId) {
			return { ...find(videoId) };
		},

		async createVideo(title) {
			sequence += 1;
			const videoId = `fake-video-${String(sequence).padStart(4, '0')}`;
			videos.set(videoId, {
				videoId,
				title,
				lengthSeconds: 0,
				status: 'uploading',
				width: null,
				height: null,
				thumbnailUrl: null,
				dateUploaded: new Date(now()).toISOString()
			});
			return { videoId };
		},

		uploadTicket: (videoId, ttlSeconds) =>
			signedUploadTicket(libraryId, apiKey, videoId, nowSeconds() + ttlSeconds),

		async setThumbnail(videoId, thumbnailTime) {
			find(videoId);
			thumbnailTimes.set(videoId, thumbnailTime);
		},

		async deleteVideo(videoId) {
			find(videoId);
			videos.delete(videoId);
		},

		finishEncoding(videoId, details = {}) {
			const video: BunnyVideo = {
				...find(videoId),
				lengthSeconds: 600,
				width: 1920,
				height: 1080,
				thumbnailUrl: `https://fake.b-cdn.net/${videoId}/thumbnail.jpg`,
				...details,
				status: details.status ?? 'ready'
			};
			videos.set(videoId, video);
			return { ...video };
		}
	};
}
