import type { RequestEvent } from '@sveltejs/kit';
import type { ScreenInput, ScreenScope } from '#lib/server/modules/marketing/index.ts';
import { keyFor } from '#lib/server/platform/request-limits.ts';
import { HONEYPOT_FIELD, TURNSTILE_FIELD } from '#lib/shared/schemas/marketing.ts';

/** The client address, or undefined when the adapter cannot tell it. */
function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string | undefined {
	try {
		return event.getClientAddress();
	} catch {
		return undefined;
	}
}

/**
 * What `marketing.screen` needs from a public form submission: the hashed
 * limiter key for the client, its address for Turnstile, the honeypot and the
 * Turnstile token.
 */
export function screenInput(
	event: Pick<RequestEvent, 'getClientAddress'>,
	scope: ScreenScope,
	form: Record<string, string>
): ScreenInput {
	return {
		scope,
		clientKey: keyFor(scope, event),
		ip: clientAddress(event),
		honeypot: (form[HONEYPOT_FIELD] ?? '').trim(),
		turnstileToken: form[TURNSTILE_FIELD] ?? ''
	};
}
