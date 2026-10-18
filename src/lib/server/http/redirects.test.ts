import { describe, expect, it } from 'vitest';
import { safeRelativeTarget } from './redirects.ts';

describe('safeRelativeTarget', () => {
	it('accepts a plain relative path', () => {
		expect(safeRelativeTarget('/library')).toBe('/library');
	});

	it('accepts a nested relative path with a query string', () => {
		expect(safeRelativeTarget('/modules/a/b?x=1')).toBe('/modules/a/b?x=1');
	});

	it('falls back for a protocol-relative URL', () => {
		expect(safeRelativeTarget('//evil.com')).toBe('/library');
	});

	it('falls back for a backslash host form', () => {
		expect(safeRelativeTarget('/\\evil.com')).toBe('/library');
	});

	it('falls back for an absolute URL', () => {
		expect(safeRelativeTarget('https://evil.com')).toBe('/library');
	});

	it('falls back for an empty string', () => {
		expect(safeRelativeTarget('')).toBe('/library');
	});

	it('falls back for null', () => {
		expect(safeRelativeTarget(null)).toBe('/library');
	});

	it('falls back for undefined', () => {
		expect(safeRelativeTarget(undefined)).toBe('/library');
	});

	it('honours a custom fallback', () => {
		expect(safeRelativeTarget('//evil.com', '/catalogue')).toBe('/catalogue');
	});
});
