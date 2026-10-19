import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { createHandle, createHandleError } from '#lib/server/http/create-handle.ts';
import { isMaintenanceExempt } from '#lib/server/http/maintenance.ts';
import { getSentryDsn } from '#lib/server/runtime/env.ts';
import { getServices } from '#lib/server/runtime/container.ts';
import { scrubEvent } from '#lib/shared/sentry.ts';

// Sentry is off unless a DSN is configured (never during the build).
const dsn = getSentryDsn();
if (dsn) {
	Sentry.init({
		dsn,
		tracesSampleRate: 0.1,
		// sendDefaultPii is superseded by dataCollection in this SDK version
		dataCollection: { userInfo: false, cookies: false },
		beforeSend: scrubEvent
	});
}

export const handle = sequence(
	Sentry.sentryHandle(),
	createHandle({ getServices, isMaintenanceExempt })
);
export const handleError = Sentry.handleErrorWithSentry(createHandleError({ getServices }));
