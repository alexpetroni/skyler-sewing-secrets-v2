import { createAuth, createAuthService } from '../../src/lib/server/modules/auth/index.ts';
import type { Db } from '../../src/lib/server/db/index.ts';
import type { LogFields, Logger } from '../../src/lib/server/platform/logger.ts';
import type { Services } from '../../src/lib/server/runtime/container.ts';

export const TEST_SITE_URL = 'http://localhost:5173';

export interface LogEntry {
	level: 'debug' | 'info' | 'warn' | 'error';
	message: string;
	fields?: LogFields;
}

/** A logger that keeps every entry in memory. */
export function createMemoryLogger(entries: LogEntry[] = [], bindings: LogFields = {}): Logger {
	const push = (level: LogEntry['level'], message: string, fields?: LogFields) => {
		entries.push({ level, message, fields: { ...bindings, ...fields } });
	};
	return {
		debug: (m, f) => push('debug', m, f),
		info: (m, f) => push('info', m, f),
		warn: (m, f) => push('warn', m, f),
		error: (m, f) => push('error', m, f),
		child: (childBindings) => createMemoryLogger(entries, { ...bindings, ...childBindings })
	};
}

export interface TestServices extends Services {
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
	const logEntries: LogEntry[] = [];
	const google = overrides.googleEnabled
		? { clientId: 'google-client-id', clientSecret: 'google-client-secret' }
		: undefined;

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
		logger: createMemoryLogger(logEntries),
		googleEnabled: google !== undefined,
		resetEmails,
		logEntries
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
