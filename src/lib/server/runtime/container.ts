import { createDb, type Db } from '#lib/server/db/index.ts';
import {
	createAuth,
	createAuthService,
	type Auth,
	type AuthService
} from '#lib/server/modules/auth/index.ts';
import { createConsoleLogger, type Logger } from '#lib/server/platform/logger.ts';
import { getRuntimeConfig, type RuntimeConfig } from './env.ts';

/**
 * Everything a request handler may use, exposed as `event.locals.services`.
 * Later phases extend this with their service objects.
 */
export interface Services {
	db: Db;
	auth: Auth;
	users: AuthService;
	logger: Logger;
	/** Whether Google sign-in is configured; drives the OAuth UI. */
	googleEnabled: boolean;
}

/** Builds the services from an explicit configuration; `getServices` caches the result. */
export async function createServices(config: RuntimeConfig): Promise<Services> {
	const logger = createConsoleLogger();
	const db = await createDb({ url: config.databaseUrl, driver: config.databaseDriver });
	const auth = createAuth({
		db,
		secret: config.betterAuthSecret,
		baseURL: config.siteUrl,
		google: config.google,
		// The Resend mailer and the email templates arrive in PHASE-06; until
		// then a reset request is recorded without the address or the link.
		sendPasswordReset: async () => {
			logger.warn('password reset email not sent: no mailer configured yet');
		}
	});

	return {
		db,
		auth,
		users: createAuthService({ db }),
		logger,
		googleEnabled: config.google !== undefined
	};
}

let instance: Promise<Services> | undefined;

/**
 * The composition root: lazily builds the database client, Better Auth and
 * the services once per process. Nothing here runs at import time, so the
 * build needs no environment variables.
 */
export function getServices(): Promise<Services> {
	if (!instance) {
		instance = createServices(getRuntimeConfig()).catch((err: unknown) => {
			instance = undefined;
			throw err;
		});
	}
	return instance;
}
