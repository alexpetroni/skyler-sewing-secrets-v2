import { describe, expect, it, vi } from 'vitest';

// No BETTER_AUTH_SECRET: the helper must refuse to mint unsigned tokens.
vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { unsubscribeToken } from './newsletter';

describe('unsubscribeToken without BETTER_AUTH_SECRET', () => {
	it('rejects instead of minting a token', async () => {
		await expect(unsubscribeToken('a@b.c')).rejects.toThrow('BETTER_AUTH_SECRET is not set');
	});
});
