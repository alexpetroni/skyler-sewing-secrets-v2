import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import type { Services } from '../../src/lib/server/runtime/container.ts';
import type { FakeEvent } from './event.ts';
import { signInCookie } from './services.ts';

/** The code an authenticator app shows right now for the base32 `secret` of a TOTP URI. */
export function totpCode(secret: string): Promise<string> {
	return createOTP(new TextDecoder().decode(base32.decode(secret))).totp();
}

/**
 * The `cookie` header a browser would send next: `previous` updated with
 * every cookie set on `event` (deleted ones removed).
 */
export function cookieHeader(event: FakeEvent, previous = ''): string {
	const jar = new Map<string, string>();
	for (const pair of previous.split(';')) {
		const [name, ...rest] = pair.trim().split('=');
		if (name) jar.set(name, rest.join('='));
	}
	for (const cookie of event.setCookies) {
		if (cookie.value === '' || cookie.options?.maxAge === 0) jar.delete(cookie.name);
		else jar.set(cookie.name, encodeURIComponent(cookie.value));
	}
	return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

export interface TotpAccount {
	/** The base32 secret from the otpauth URI. */
	secret: string;
	backupCodes: string[];
	/** A session cookie valid after two-factor was turned on. */
	cookie: string;
}

/**
 * Turns TOTP on for a credential user through Better Auth's own endpoints
 * (sign in, enable, verify the first code) and returns what a test needs to
 * sign in again: the secret, the backup codes and a live session cookie.
 */
export async function enableTotp(
	services: Services,
	email: string,
	password: string
): Promise<TotpAccount> {
	const signedIn = await signInCookie(services, email, password);
	const setup = await services.auth.api.enableTwoFactor({
		body: { password, method: 'totp' },
		headers: new Headers({ cookie: signedIn })
	});
	if (setup.method !== 'totp') throw new Error('enableTwoFactor returned no TOTP');
	const secret = new URL(setup.totpURI).searchParams.get('secret') ?? '';
	const { headers } = await services.auth.api.verifyTOTP({
		body: { code: await totpCode(secret) },
		headers: new Headers({ cookie: signedIn }),
		returnHeaders: true
	});
	const setCookie = headers.get('set-cookie');
	if (!setCookie) throw new Error('verifyTOTP returned no set-cookie header');
	const cookie = setCookie
		.split(/,(?=\s*[^;,\s]+=)/)
		.map((part) => part.split(';')[0].trim())
		.filter((part) => !part.endsWith('='))
		.join('; ');
	return { secret, backupCodes: setup.backupCodes, cookie };
}
