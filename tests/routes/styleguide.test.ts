import { isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from '../../src/routes/(dev)/styleguide/+page.server.ts';

const appEnv = vi.hoisted(() => ({ dev: false }));

vi.mock('$app/env', () => ({
	get dev() {
		return appEnv.dev;
	},
	building: false,
	browser: false,
	version: 'test'
}));

type LoadEvent = Parameters<typeof load>[0];

function callLoad() {
	return load({} as LoadEvent);
}

describe('/styleguide load', () => {
	beforeEach(() => {
		appEnv.dev = false;
	});

	it('responds 404 outside dev', () => {
		let thrown: unknown;
		try {
			callLoad();
		} catch (err) {
			thrown = err;
		}

		expect(isHttpError(thrown, 404)).toBe(true);
	});

	it('renders in dev', () => {
		appEnv.dev = true;

		expect(callLoad()).toEqual({});
	});
});
