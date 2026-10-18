import { APIError } from 'better-auth/api';
import QRCode from 'qrcode';
import { DomainError } from '#lib/server/modules/errors.ts';
import type { Auth } from './create-auth.ts';

/** What the admin sees once, right after `begin`. */
export interface TwoFactorSetup {
	/** The otpauth URI as a PNG data URL for the authenticator app to scan. */
	qrDataUrl: string;
	/** The base32 secret, for apps that cannot scan. */
	secret: string;
	/** Shown once; Better Auth keeps them encrypted. */
	backupCodes: string[];
}

export type TwoFactorMethod = 'totp' | 'backup';

export interface TwoFactorService {
	/**
	 * Checks the password, mints a secret and backup codes. Two-factor stays
	 * off until `confirm` sees the first code from the app.
	 */
	begin(input: { password: string; headers: Headers }): Promise<TwoFactorSetup>;
	/** The first code from the app; turns `users.twoFactorEnabled` on. */
	confirm(input: { code: string; headers: Headers }): Promise<void>;
	/** Needs the password and a current code. */
	disable(input: { password: string; code: string; headers: Headers }): Promise<void>;
	/**
	 * Finishes a sign-in that Better Auth parked behind its two-factor cookie
	 * (sent with `headers`); resolves to the user id once the session exists.
	 */
	completeSignIn(input: {
		code: string;
		method: TwoFactorMethod;
		headers: Headers;
	}): Promise<string>;
}

/** User-facing messages for the Better Auth codes the forms can run into. */
const MESSAGES: Record<string, string> = {
	INVALID_PASSWORD: 'Incorrect password',
	INVALID_CODE: 'That code is not valid',
	INVALID_BACKUP_CODE: 'That backup code is not valid',
	TOTP_ALREADY_ENABLED: 'Two-factor authentication is already on',
	TOTP_NOT_ENABLED: 'Two-factor authentication is not set up',
	TWO_FACTOR_NOT_ENABLED: 'Two-factor authentication is not set up',
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Too many attempts. Please sign in again.',
	ACCOUNT_TEMPORARILY_LOCKED:
		'Too many failed codes. The account is locked for a while; please try again later.',
	INVALID_TWO_FACTOR_COOKIE: 'Your sign-in has expired. Please sign in again.'
};

/** Better Auth refusals become `DomainError`s the routes can map; anything else is a bug. */
function translate(err: unknown): never {
	if (err instanceof APIError) {
		const code = typeof err.body?.code === 'string' ? err.body.code : 'TWO_FACTOR_FAILED';
		throw new DomainError(
			code,
			MESSAGES[code] ?? 'Two-factor authentication failed. Please try again.'
		);
	}
	throw err;
}

export function createTwoFactorService({ auth }: { auth: Auth }): TwoFactorService {
	return {
		async begin({ password, headers }) {
			let result: Awaited<ReturnType<typeof auth.api.enableTwoFactor>>;
			try {
				result = await auth.api.enableTwoFactor({ body: { password, method: 'totp' }, headers });
			} catch (err) {
				translate(err);
			}
			if (result.method !== 'totp') throw new Error('enableTwoFactor returned no TOTP setup');
			const secret = new URL(result.totpURI).searchParams.get('secret') ?? '';
			return {
				qrDataUrl: await QRCode.toDataURL(result.totpURI, { margin: 1, width: 192 }),
				secret,
				backupCodes: result.backupCodes
			};
		},

		async confirm({ code, headers }) {
			try {
				await auth.api.verifyTOTP({ body: { code }, headers });
			} catch (err) {
				translate(err);
			}
		},

		async disable({ password, code, headers }) {
			try {
				// The code first, so a wrong password never reveals whether the code was right.
				await auth.api.verifyTOTP({ body: { code }, headers });
				await auth.api.disableTwoFactor({ body: { password }, headers });
			} catch (err) {
				translate(err);
			}
		},

		async completeSignIn({ code, method, headers }) {
			try {
				const result =
					method === 'backup'
						? await auth.api.verifyBackupCode({ body: { code }, headers })
						: await auth.api.verifyTOTP({ body: { code }, headers });
				return result.user.id;
			} catch (err) {
				translate(err);
			}
		}
	};
}
