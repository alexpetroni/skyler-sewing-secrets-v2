import type { Logger, LimitRule, RequestLimiter } from '#lib/server/platform/index.ts';

/** The unauthenticated write endpoints that are screened (security audit H5). */
export type ScreenScope = 'newsletter' | 'contact';

export const SCREEN_RULES: Readonly<Record<ScreenScope, LimitRule>> = {
	newsletter: { max: 10, windowSeconds: 60 * 60 },
	contact: { max: 5, windowSeconds: 60 * 60 }
};

export interface ScreenInput {
	scope: ScreenScope;
	/** Limiter key for the client, e.g. `keyFor('contact', event)` (hashed address). */
	clientKey: string;
	/** Client address handed to Turnstile; never stored or logged. */
	ip?: string;
	/** Value of the honeypot field. */
	honeypot: string;
	/** Turnstile widget token; checked only when Turnstile is configured. */
	turnstileToken: string;
}

export type ScreenResult =
	| { outcome: 'pass' }
	| { outcome: 'rate_limited'; retryAfterSeconds: number }
	/** A bot filled the honeypot: answer as if accepted, do nothing. */
	| { outcome: 'honeypot' }
	| { outcome: 'challenge_failed' };

export type VerifyTurnstile = (token: string, ip?: string) => Promise<boolean>;

export interface ScreenDeps {
	limiter: RequestLimiter;
	log: Logger;
	verifyTurnstile?: VerifyTurnstile;
}

/**
 * Anti-abuse gate for public submissions, run before any validation or side
 * effect: the request limiter first (every attempt counts), then the
 * honeypot, then Turnstile when configured.
 */
export function createScreen({ limiter, log, verifyTurnstile }: ScreenDeps) {
	return async function screen(input: ScreenInput): Promise<ScreenResult> {
		const limit = await limiter.consume(input.clientKey, SCREEN_RULES[input.scope]);
		if (!limit.allowed) {
			log.warn('public submission rate limited', { scope: input.scope });
			return { outcome: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds };
		}
		if (input.honeypot !== '') {
			log.info('public submission caught by honeypot', { scope: input.scope });
			return { outcome: 'honeypot' };
		}
		if (verifyTurnstile && !(await verifyTurnstile(input.turnstileToken, input.ip))) {
			log.warn('public submission failed the Turnstile challenge', { scope: input.scope });
			return { outcome: 'challenge_failed' };
		}
		return { outcome: 'pass' };
	};
}
