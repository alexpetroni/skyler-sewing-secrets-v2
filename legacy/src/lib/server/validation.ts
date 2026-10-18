/**
 * Pure form-field parsers shared by the admin actions. No framework types
 * and no imports from `$lib/server/db` or `$lib/server/auth`, so this module
 * can be unit-tested in isolation.
 */

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface IntFieldOptions {
	min?: number;
	max?: number;
	required?: boolean;
	fallback?: number | null;
}

function boundsMessage(min: number | undefined, max: number | undefined): string {
	if (min !== undefined && max !== undefined) {
		return `Must be a whole number between ${min} and ${max}`;
	}
	if (min !== undefined) {
		return `Must be a whole number of at least ${min}`;
	}
	if (max !== undefined) {
		return `Must be a whole number of at most ${max}`;
	}
	return 'Must be a whole number';
}

/**
 * Parse an integer form field. Empty input yields `fallback ?? null` unless
 * `required`; anything that is not a whole number within [min, max] is an
 * error, so `NaN` can never reach the database.
 */
export function parseIntField(
	raw: FormDataEntryValue | null,
	opts: IntFieldOptions = {}
): FieldResult<number | null> {
	const text = typeof raw === 'string' ? raw.trim() : '';

	if (text === '') {
		if (opts.required) {
			return { ok: false, error: 'This field is required' };
		}
		return { ok: true, value: opts.fallback ?? null };
	}

	// Number() rejects trailing garbage ('12abc' -> NaN) where parseInt would
	// silently return 12; isInteger also rejects NaN, Infinity and decimals.
	const value = Number(text);
	if (!Number.isInteger(value)) {
		return { ok: false, error: boundsMessage(opts.min, opts.max) };
	}
	if ((opts.min !== undefined && value < opts.min) || (opts.max !== undefined && value > opts.max)) {
		return { ok: false, error: boundsMessage(opts.min, opts.max) };
	}

	return { ok: true, value };
}

// Same regex as src/routes/api/progress/+server.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse an optional date field into an ISO string. Empty -> null. A bare
 * `YYYY-MM-DD` means the END of that UTC day, so a promo "valid until 31
 * December" still works on 31 December. Anything else that `new Date` accepts
 * is stored as its ISO string; anything else is an error.
 */
export function parseDateField(raw: FormDataEntryValue | null): FieldResult<string | null> {
	const text = typeof raw === 'string' ? raw.trim() : '';

	if (text === '') {
		return { ok: true, value: null };
	}

	const date = new Date(BARE_DATE_RE.test(text) ? `${text}T23:59:59.999Z` : text);
	// Validity must be checked before toISOString(), which throws on Invalid Date
	if (Number.isNaN(date.getTime())) {
		return { ok: false, error: 'Must be a valid date (YYYY-MM-DD)' };
	}

	return { ok: true, value: date.toISOString() };
}

export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;

/** `bunny:<libraryId>/<videoId>` — the only video_url format VideoPlayer renders */
export function isBunnyVideoRef(value: string): boolean {
	return /^bunny:\d+\/[A-Za-z0-9-]+$/.test(value);
}

export function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}
