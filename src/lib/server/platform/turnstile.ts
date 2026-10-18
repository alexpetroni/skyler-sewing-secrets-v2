/**
 * Cloudflare Turnstile server-side verification. The container builds a
 * verifier only when `TURNSTILE_SECRET_KEY` is set; services treat a missing
 * verifier as "not configured" and skip the check.
 */

export const TURNSTILE_VERIFY_ENDPOINT =
	'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifier {
	/** Whether Cloudflare accepts `token` (optionally bound to the client `ip`). */
	verify(token: string, ip?: string): Promise<boolean>;
}

export interface TurnstileVerifierOptions {
	secret: string;
	fetch: typeof fetch;
}

/** A failed siteverify call (network-level or non-2xx), as opposed to a rejected token. */
export class TurnstileError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'TurnstileError';
		this.status = status;
	}
}

export function createTurnstileVerifier(options: TurnstileVerifierOptions): TurnstileVerifier {
	const { secret, fetch: fetchFn } = options;

	return {
		async verify(token, ip) {
			// An empty token never passes; no need to ask Cloudflare.
			if (!token) return false;
			const body = new URLSearchParams({ secret, response: token });
			if (ip) body.set('remoteip', ip);

			const response = await fetchFn(TURNSTILE_VERIFY_ENDPOINT, { method: 'POST', body });
			if (!response.ok) {
				throw new TurnstileError(
					`Turnstile siteverify failed with ${response.status}`,
					response.status
				);
			}
			const data = (await response.json()) as { success?: unknown };
			return data.success === true;
		}
	};
}
