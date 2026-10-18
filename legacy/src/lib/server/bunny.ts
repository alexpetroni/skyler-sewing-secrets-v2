import { env as privateEnv } from '$env/dynamic/private';
import { parseBunnyUrl } from '$lib/types';

/**
 * Bunny Stream "Embedded view token authentication"
 * (https://docs.bunny.net/docs/stream-embed-token-authentication, verified 2026-09-06):
 *
 *   token   = SHA256_HEX(token_security_key + video_id + expiration)
 *   expires = UNIX timestamp in seconds until which the URL is valid
 *
 * appended to the embed URL as `token=<hex>&expires=<seconds>`.
 * The key never leaves the server: it is read from private env only.
 */

const EMBED_BASE = 'https://iframe.mediadelivery.net/embed';
const EMBED_QUERY = 'autoplay=false&preload=true';
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the iframe embed URL for a `bunny:{libraryId}/{videoId}` reference.
 * Returns null for missing or unparsable input. When BUNNY_EMBED_TOKEN_KEY is unset the
 * URL is unsigned (identical to the pre-signing output); when set, `token`
 * and `expires` are appended per the formula above.
 */
export async function getBunnyEmbedUrl(
	videoUrl: string | null,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<string | null> {
	const video = videoUrl ? parseBunnyUrl(videoUrl) : null;
	if (!video) return null;

	const embedUrl = `${EMBED_BASE}/${video.libraryId}/${video.videoId}?${EMBED_QUERY}`;

	const key = privateEnv.BUNNY_EMBED_TOKEN_KEY;
	if (!key) return embedUrl;

	const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
	const token = await sha256Hex(`${key}${video.videoId}${expires}`);

	return `${embedUrl}&token=${token}&expires=${expires}`;
}
