import { isHttpError, isRedirect } from '@sveltejs/kit';
import { resolveAccess } from '../../src/lib/server/modules/auth/index.ts';
import type { Services } from '../../src/lib/server/runtime/container.ts';
import { fakeEvent, type FakeEvent, type FakeEventOptions } from './event.ts';

export interface MemberEventOptions extends Omit<FakeEventOptions, 'locals'> {
	params?: Record<string, string>;
}

/** An event as the hook pipeline would leave it for the given user (null = anonymous). */
export async function memberEvent(
	services: Services,
	userId: string | null,
	{ params = {}, ...options }: MemberEventOptions = {}
): Promise<FakeEvent> {
	const profile = userId ? await services.users.getProfile(userId) : null;
	const allAccess = userId ? await services.entitlements.hasAllAccess(userId) : false;
	const event = fakeEvent({
		...options,
		locals: {
			services,
			requestId: 'req-1',
			user: profile
				? {
						id: profile.id,
						email: profile.email,
						name: profile.full_name ?? '',
						emailVerified: false,
						twoFactorEnabled: false,
						createdAt: new Date(profile.created_at),
						updatedAt: new Date(profile.updated_at)
					}
				: null,
			profile,
			access: resolveAccess(profile, allAccess)
		}
	});
	Object.assign(event, { params });
	return event;
}

/** What a load or action ended in: its value, or `redirect <status> <location>` / `error <status>`. */
export async function outcome<T>(run: () => T | Promise<T>): Promise<T | string> {
	try {
		return await run();
	} catch (e) {
		if (isRedirect(e)) return `redirect ${e.status} ${e.location}`;
		if (isHttpError(e)) return `error ${e.status}`;
		throw e;
	}
}
