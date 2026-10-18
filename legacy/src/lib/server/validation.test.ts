import { describe, expect, it } from 'vitest';
import {
	isBunnyVideoRef,
	isHttpsUrl,
	isUuid,
	parseDateField,
	parseIntField,
	PROMO_CODE_PATTERN
} from './validation';

describe('parseIntField', () => {
	it('returns the fallback for an empty optional field', () => {
		expect(parseIntField('', { fallback: 7 })).toEqual({ ok: true, value: 7 });
		expect(parseIntField(null)).toEqual({ ok: true, value: null });
	});

	it('errors for an empty required field', () => {
		expect(parseIntField('  ', { required: true })).toEqual({
			ok: false,
			error: 'This field is required'
		});
	});

	it('errors for trailing garbage', () => {
		expect(parseIntField('12abc').ok).toBe(false);
	});

	it('errors below min', () => {
		expect(parseIntField('0', { min: 1, max: 100 })).toEqual({
			ok: false,
			error: 'Must be a whole number between 1 and 100'
		});
	});

	it('errors above max', () => {
		expect(parseIntField('101', { min: 1, max: 100 }).ok).toBe(false);
	});

	it('returns the value when in range', () => {
		expect(parseIntField('42', { min: 1, max: 100 })).toEqual({ ok: true, value: 42 });
	});
});

describe('isUuid', () => {
	it('accepts a valid uuid', () => {
		expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
	});

	it('rejects a non-uuid string', () => {
		expect(isUuid('abc')).toBe(false);
	});

	it('rejects an empty string', () => {
		expect(isUuid('')).toBe(false);
	});
});

describe('parseDateField', () => {
	it('returns null for an empty field', () => {
		expect(parseDateField('')).toEqual({ ok: true, value: null });
	});

	it('errors for an unparsable date', () => {
		expect(parseDateField('not a date')).toEqual({
			ok: false,
			error: 'Must be a valid date (YYYY-MM-DD)'
		});
	});

	it('treats a bare date as the end of that UTC day', () => {
		const result = parseDateField('2026-12-31');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value?.endsWith('T23:59:59.999Z')).toBe(true);
		expect(result.value).toBe('2026-12-31T23:59:59.999Z');
	});
});

describe('PROMO_CODE_PATTERN', () => {
	it('accepts SAVE10', () => {
		expect(PROMO_CODE_PATTERN.test('SAVE10')).toBe(true);
	});

	it('rejects a code with a space', () => {
		expect(PROMO_CODE_PATTERN.test('hi there')).toBe(false);
	});
});

describe('isBunnyVideoRef', () => {
	it('accepts bunny:{libraryId}/{videoId}', () => {
		expect(isBunnyVideoRef('bunny:123/abc-def')).toBe(true);
	});

	it('rejects a plain URL', () => {
		expect(isBunnyVideoRef('https://example.com/video.mp4')).toBe(false);
	});
});

describe('isHttpsUrl', () => {
	it('accepts an https URL', () => {
		expect(isHttpsUrl('https://a.b')).toBe(true);
	});

	it('rejects an http URL', () => {
		expect(isHttpsUrl('http://a.b')).toBe(false);
	});

	it('rejects a javascript: URL', () => {
		expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
	});
});
