import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Signed unsubscribe token: HMAC-SHA256 of the lower-cased email, keyed with
 * BETTER_AUTH_SECRET and hex-encoded. Throws when the secret is unset so a
 * misconfigured deployment can never mint (or verify) unsigned links.
 */
export async function unsubscribeToken(email: string): Promise<string> {
	const secret = privateEnv.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error('BETTER_AUTH_SECRET is not set');
	}

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(email.toLowerCase()));
	return toHex(signature);
}

export async function unsubscribeUrl(email: string): Promise<string> {
	const siteUrl = publicEnv.PUBLIC_SITE_URL || 'https://skylersewingsecrets.com';
	const token = await unsubscribeToken(email);
	return `${siteUrl}/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

/**
 * Constant-time comparison: the loop always runs over the full expected
 * token, so timing does not leak how many leading characters matched.
 */
export async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
	const expected = await unsubscribeToken(email);
	if (token.length !== expected.length) {
		return false;
	}

	let mismatch = 0;
	for (let i = 0; i < expected.length; i++) {
		mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	}
	return mismatch === 0;
}
