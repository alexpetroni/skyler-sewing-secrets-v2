import type { TurnstileVerifier } from '../turnstile.ts';

export interface FakeTurnstile extends TurnstileVerifier {
	/** Every `verify` call, in order. */
	readonly calls: Array<{ token: string; ip?: string }>;
	/** Sets what the next `verify` calls answer. */
	setResult(result: boolean): void;
}

/** A verifier with a scripted answer (`true` unless told otherwise). */
export function createFakeTurnstile(initial = true): FakeTurnstile {
	const calls: FakeTurnstile['calls'] = [];
	let result = initial;

	return {
		calls,
		setResult(next) {
			result = next;
		},
		async verify(token, ip) {
			calls.push({ token, ip });
			return result;
		}
	};
}
