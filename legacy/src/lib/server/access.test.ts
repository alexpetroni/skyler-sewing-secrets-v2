import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { User } from '$lib/types';
import { isActiveAdmin, isActiveMember, requireActiveMember, SUSPENDED_MESSAGE } from './access';

type Flags = Pick<User, 'is_member' | 'is_admin' | 'is_suspended'>;

function profile(flags: Flags): User {
	return {
		id: 'user-1',
		email: 'a@b.c',
		full_name: null,
		avatar_url: null,
		member_since: null,
		created_at: '2026-01-01T00:00:00.000Z',
		...flags
	};
}

// Full truth table over { is_member, is_admin, is_suspended }.
// Invariant: a suspended account is neither a member nor an admin.
const truthTable: Array<[Flags, { member: boolean; admin: boolean }]> = [
	[{ is_member: false, is_admin: false, is_suspended: false }, { member: false, admin: false }],
	[{ is_member: false, is_admin: false, is_suspended: true }, { member: false, admin: false }],
	[{ is_member: false, is_admin: true, is_suspended: false }, { member: false, admin: true }],
	[{ is_member: false, is_admin: true, is_suspended: true }, { member: false, admin: false }],
	[{ is_member: true, is_admin: false, is_suspended: false }, { member: true, admin: false }],
	[{ is_member: true, is_admin: false, is_suspended: true }, { member: false, admin: false }],
	[{ is_member: true, is_admin: true, is_suspended: false }, { member: true, admin: true }],
	[{ is_member: true, is_admin: true, is_suspended: true }, { member: false, admin: false }]
];

describe('isActiveMember', () => {
	it.each(truthTable)('%j -> %j', (flags, expected) => {
		expect(isActiveMember(profile(flags))).toBe(expected.member);
	});

	it('is false for null', () => {
		expect(isActiveMember(null)).toBe(false);
	});

	it('is false for undefined', () => {
		expect(isActiveMember(undefined)).toBe(false);
	});
});

describe('isActiveAdmin', () => {
	it.each(truthTable)('%j -> %j', (flags, expected) => {
		expect(isActiveAdmin(profile(flags))).toBe(expected.admin);
	});

	it('is false for null', () => {
		expect(isActiveAdmin(null)).toBe(false);
	});

	it('is false for undefined', () => {
		expect(isActiveAdmin(undefined)).toBe(false);
	});
});

function thrownBy(fn: () => void): unknown {
	try {
		fn();
	} catch (thrown) {
		return thrown;
	}
	throw new Error('expected the call to throw');
}

describe('requireActiveMember', () => {
	it('redirects a signed-out visitor to sign-in with a return target', () => {
		const thrown = thrownBy(() => requireActiveMember(null, '/modules/a'));
		expect(isRedirect(thrown)).toBe(true);
		if (!isRedirect(thrown)) return;
		expect(thrown.status).toBe(303);
		expect(thrown.location.startsWith('/auth/sign-in?redirectTo=')).toBe(true);
		expect(thrown.location).toBe('/auth/sign-in?redirectTo=%2Fmodules%2Fa');
	});

	it('redirects a non-member to checkout with a return target', () => {
		const nonMember = profile({ is_member: false, is_admin: false, is_suspended: false });
		const thrown = thrownBy(() => requireActiveMember(nonMember, '/modules/a'));
		expect(isRedirect(thrown)).toBe(true);
		if (!isRedirect(thrown)) return;
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/checkout?redirectTo=%2Fmodules%2Fa');
	});

	it('throws 403 for a suspended member', () => {
		const suspended = profile({ is_member: true, is_admin: false, is_suspended: true });
		const thrown = thrownBy(() => requireActiveMember(suspended, '/modules/a'));
		expect(isHttpError(thrown)).toBe(true);
		if (!isHttpError(thrown)) return;
		expect(thrown.status).toBe(403);
		expect(thrown.body.message).toBe(SUSPENDED_MESSAGE);
	});

	it('returns for an active member', () => {
		const member = profile({ is_member: true, is_admin: false, is_suspended: false });
		expect(() => requireActiveMember(member, '/modules/a')).not.toThrow();
	});
});
