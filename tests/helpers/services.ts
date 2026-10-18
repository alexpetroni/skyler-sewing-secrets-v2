import { createAuth, createAuthService } from '../../src/lib/server/modules/auth/index.ts';
import type { Db } from '../../src/lib/server/db/index.ts';
import { createFakeLogger, type LogEntry } from '../../src/lib/server/platform/fakes/logger.ts';
import { createFakeMailer, type FakeMailer } from '../../src/lib/server/platform/fakes/mailer.ts';
import {
	createFakePaymentGateway,
	type FakePaymentGateway
} from '../../src/lib/server/platform/fakes/payment-gateway.ts';
import {
	createFakeVideoHost,
	type FakeVideoHost
} from '../../src/lib/server/platform/fakes/video-host.ts';
import { createRequestLimiter } from '../../src/lib/server/platform/request-limits.ts';
import type { Services } from '../../src/lib/server/runtime/container.ts';

export const TEST_SITE_URL = 'http://localhost:5173';

export type { LogEntry };

export interface TestServices extends Services {
	payments: FakePaymentGateway;
	videoHost: FakeVideoHost;
	mailer: FakeMailer;
	/** Reset emails the fake mailer "sent". */
	resetEmails: Array<{ to: string; url: string }>;
	logEntries: LogEntry[];
}

/**
 * Real Better Auth and auth service on the given PGlite database, with an
 * in-memory mailer and logger. Files that use it mock `$app/server` so the
 * sveltekitCookies plugin finds no request event (or the fake one).
 */
export function createTestServices(
	db: Db,
	overrides: { googleEnabled?: boolean } = {}
): TestServices {
	const resetEmails: TestServices['resetEmails'] = [];
	const google = overrides.googleEnabled
		? { clientId: 'google-client-id', clientSecret: 'google-client-secret' }
		: undefined;

	const logger = createFakeLogger();
	const auth = createAuth({
		db,
		secret: 'test-secret-that-is-long-enough-for-better-auth',
		baseURL: TEST_SITE_URL,
		google,
		sendPasswordReset: async (to, url) => {
			resetEmails.push({ to, url });
		}
	});

	return {
		db,
		auth,
		users: createAuthService({ db }),
		logger,
		payments: createFakePaymentGateway(),
		videoHost: createFakeVideoHost(),
		mailer: createFakeMailer(),
		limiter: createRequestLimiter({ db }),
		googleEnabled: google !== undefined,
		resetEmails,
		logEntries: logger.entries
	};
}

/** Signs in through Better Auth and returns the `cookie` header a browser would send back. */
export async function signInCookie(
	services: Services,
	email: string,
	password: string
): Promise<string> {
	const { headers } = await services.auth.api.signInEmail({
		body: { email, password },
		returnHeaders: true
	});
	const setCookie = headers.get('set-cookie');
	if (!setCookie) throw new Error('signInEmail returned no set-cookie header');
	// One or more Set-Cookie values; keep each `name=value` pair.
	return setCookie
		.split(/,(?=\s*[^;,\s]+=)/)
		.map((part) => part.split(';')[0].trim())
		.join('; ');
}
