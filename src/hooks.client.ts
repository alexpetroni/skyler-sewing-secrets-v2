import { PUBLIC_SENTRY_DSN } from '$app/env/public';
import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit/hooks';
import { scrubEvent } from '#lib/shared/sentry.ts';

if (PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: PUBLIC_SENTRY_DSN,
		tracesSampleRate: 0.1,
		// sendDefaultPii is superseded by dataCollection in this SDK version
		dataCollection: { userInfo: false, cookies: false },
		beforeSend: scrubEvent
	});
}

const ourHandleError: HandleClientError = () => ({ message: 'Something went wrong.' });

export const handleError = Sentry.handleErrorWithSentry(ourHandleError);
