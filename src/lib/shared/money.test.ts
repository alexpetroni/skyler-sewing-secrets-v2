import { describe, expect, it } from 'vitest';
import { formatPence, parsePounds, penceToPounds } from '#lib/shared/money.ts';

describe('formatPence', () => {
	it('formats whole pounds with two decimals', () => {
		expect(formatPence(14900)).toBe('£149.00');
	});

	it('formats amounts under a pound', () => {
		expect(formatPence(30)).toBe('£0.30');
	});
});

describe('parsePounds', () => {
	it('parses whole pounds to pence', () => {
		expect(parsePounds('149')).toBe(14900);
	});

	it('parses one decimal place', () => {
		expect(parsePounds('149.5')).toBe(14950);
	});

	it('rejects more than two decimal places', () => {
		expect(parsePounds('149.555')).toBeNull();
	});

	it('rejects negative amounts', () => {
		expect(parsePounds('-1')).toBeNull();
	});

	it('rejects non-numeric input', () => {
		expect(parsePounds('abc')).toBeNull();
	});

	it('rejects amounts whose pence would not be a safe integer', () => {
		expect(parsePounds('99999999999999999999')).toBeNull();
		expect(parsePounds('9999999999.99')).toBe(999_999_999_999);
	});
});

describe('penceToPounds', () => {
	it('shows pence as a pounds amount parsePounds reads back', () => {
		expect(penceToPounds(14950)).toBe('149.50');
		expect(penceToPounds(5)).toBe('0.05');
		expect(penceToPounds(null)).toBe('');
		expect(parsePounds(penceToPounds(999_999_999_999))).toBe(999_999_999_999);
	});
});
