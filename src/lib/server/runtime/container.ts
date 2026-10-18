import { createDb, type Db } from '#lib/server/db/index.ts';
import {
	createAuth,
	createAuthService,
	type Auth,
	type AuthService
} from '#lib/server/modules/auth/index.ts';
import { createCatalogService, type CatalogService } from '#lib/server/modules/catalog/index.ts';
import { createContentService, type ContentService } from '#lib/server/modules/content/index.ts';
import {
	createEntitlementService,
	type EntitlementService
} from '#lib/server/modules/entitlements/index.ts';
import {
	createMarketingService,
	passwordResetEmail,
	type MarketingService
} from '#lib/server/modules/marketing/index.ts';
import { createMediaService, type MediaService } from '#lib/server/modules/media/index.ts';
import {
	createBunnyVideoHost,
	createLogger,
	createRequestLimiter,
	createResendMailer,
	createStripeGateway,
	createTurnstileVerifier,
	type Logger,
	type Mailer,
	type PaymentGateway,
	type RequestLimiter,
	type VideoHost
} from '#lib/server/platform/index.ts';
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
	payments: PaymentGateway;
	videoHost: VideoHost;
	mailer: Mailer;
	limiter: RequestLimiter;
	media: MediaService;
	content: ContentService;
	catalog: CatalogService;
	entitlements: EntitlementService;
	marketing: MarketingService;
	/** Whether Google sign-in is configured; drives the OAuth UI. */
	googleEnabled: boolean;
}

/** Builds the services from an explicit configuration; `getServices` caches the result. */
export async function createServices(config: RuntimeConfig): Promise<Services> {
	const logger = createLogger({ level: 'info' });
	const db = await createDb({ url: config.databaseUrl, driver: config.databaseDriver });
	const mailer = createResendMailer({
		apiKey: config.resend.apiKey,
		from: config.resend.fromEmail,
		fetch
	});
	const auth = createAuth({
		db,
		secret: config.betterAuthSecret,
		baseURL: config.siteUrl,
		google: config.google,
		sendPasswordReset: async (to, url) => {
			await mailer.send({ to, ...passwordResetEmail(url, config.siteUrl) });
		}
	});

	const videoHost = createBunnyVideoHost({
		libraryId: config.bunny.videoLibraryId,
		apiKey: config.bunny.videoApiKey,
		embedTokenKey: config.bunny.embedTokenKey,
		cdnHost: config.bunny.streamCdnHost,
		fetch
	});

	const content = createContentService({ db, log: logger });
	const catalog = createCatalogService({ db, content, log: logger });
	const limiter = createRequestLimiter({ db });
	// Built only when configured; the marketing service skips the check otherwise.
	const turnstile = config.turnstile
		? createTurnstileVerifier({ secret: config.turnstile.secretKey, fetch })
		: undefined;

	return {
		db,
		auth,
		users: createAuthService({ db }),
		logger,
		payments: createStripeGateway({
			secretKey: config.stripe.secretKey,
			webhookSecret: config.stripe.webhookSecret
		}),
		videoHost,
		mailer,
		limiter,
		media: createMediaService({ db, videoHost, log: logger }),
		content,
		catalog,
		entitlements: createEntitlementService({ db, log: logger }),
		marketing: createMarketingService({
			db,
			mailer,
			limiter,
			log: logger,
			siteUrl: config.siteUrl,
			secret: config.betterAuthSecret,
			contactEmail: config.contactEmail,
			verifyTurnstile: turnstile ? (token, ip) => turnstile.verify(token, ip) : undefined
		}),
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
