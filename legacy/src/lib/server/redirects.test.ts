import { describe, expect, it } from 'vitest';
import { safeRelativeTarget } from './redirects';

describe('safeRelativeTarget', () => {
	it('accepts a plain relative path', () => {
		expect(safeRelativeTarget('/dashboard')).toBe('/dashboard');
	});

	it('accepts a nested relative path with a query string', () => {
		expect(safeRelativeTarget('/modules/a/b?x=1')).toBe('/modules/a/b?x=1');
	});

	it('falls back for a protocol-relative URL', () => {
		expect(safeRelativeTarget('//evil.com')).toBe('/dashboard');
	});

	it('falls back for a backslash host form', () => {
		expect(safeRelativeTarget('/\\evil.com')).toBe('/dashboard');
	});

	it('falls back for an absolute URL', () => {
		expect(safeRelativeTarget('https://evil.com')).toBe('/dashboard');
	});

	it('falls back for an empty string', () => {
		expect(safeRelativeTarget('')).toBe('/dashboard');
	});

	it('falls back for null', () => {
		expect(safeRelativeTarget(null)).toBe('/dashboard');
	});

	it('falls back for undefined', () => {
		expect(safeRelativeTarget(undefined)).toBe('/dashboard');
	});

	it('honours a custom fallback', () => {
		expect(safeRelativeTarget('//evil.com', '/modules')).toBe('/modules');
	});
});
