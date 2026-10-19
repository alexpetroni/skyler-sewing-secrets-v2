import type { ErrorEvent } from '@sentry/core';

/** Drops request cookies and the user's email before an event leaves the app. */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
	if (event.request) delete event.request.cookies;
	if (event.user) delete event.user.email;
	return event;
}
