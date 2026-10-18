/**
 * An expected, user-facing refusal from a service (`MEDIA_IN_USE`,
 * `LESSON_NOT_FOUND`, …). Routes map `code` to `fail()`; anything that is not
 * a `DomainError` is a bug and surfaces as a 500.
 */
export class DomainError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = 'DomainError';
		this.code = code;
	}
}
