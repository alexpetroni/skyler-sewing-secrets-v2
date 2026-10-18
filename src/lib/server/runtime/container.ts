import { createDb, type Db } from '#lib/server/db/index.ts';
import { createAdminService, type AdminService } from '#lib/server/modules/admin/index.ts';
import {
	createAuth,
	createAuthService,
	createTwoFactorService,
	type Auth,
	type AuthService,
	type TwoFactorService
} from '#lib/server/modules/auth/index.ts';
import { createCatalogService, type CatalogService } from '#lib/server/modules/catalog/index.ts';
import {
	createCartCookie,
	createCartService,
	createFulfilmentService,
	createOrderService,
	createPromoService,
	pricing,
	type CommerceServices
} from '#lib/server/modules/commerce/index.ts';
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
	createRevalidator,
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
	/** Admin TOTP setup and the second sign-in step. */
	twoFactor: TwoFactorService;
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
	commerce: CommerceServices;
	admin: AdminService;
	/** Whether Google sign-in is configured; drives the OAuth UI. */
	googleEnabled: boolean;
	/** The bearer secret the `/api/jobs/*` endpoints require. */
	cronSecret: string;
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

	const payments = createStripeGateway({
		secretKey: config.stripe.secretKey,
		webhookSecret: config.stripe.webhookSecret
	});
	const content = createContentService({ db, log: logger });
	// A no-op unless REVALIDATE_BYPASS_TOKEN is set.
	const revalidator = createRevalidator({
		bypassToken: config.revalidateBypassToken,
		siteUrl: config.siteUrl,
		fetch,
		log: logger
	});
	const catalog = createCatalogService({ db, content, log: logger, revalidator });
	const entitlements = createEntitlementService({ db, log: logger });
	const promo = createPromoService({ db, log: logger });
	const cart = createCartService({ catalog, entitlements, promo, log: logger });
	const limiter = createRequestLimiter({ db });
	const users = createAuthService({ db });
	const orders = createOrderService({
		db,
		cart,
		promo,
		catalog,
		gateway: payments,
		log: logger,
		siteUrl: config.siteUrl
	});
	const fulfilment = createFulfilmentService({
		db,
		orders,
		entitlements,
		auth: users,
		mailer,
		log: logger,
		siteUrl: config.siteUrl
	});
	// Built only when configured; the marketing service skips the check otherwise.
	const turnstile = config.turnstile
		? createTurnstileVerifier({ secret: config.turnstile.secretKey, fetch })
		: undefined;

	return {
		db,
		auth,
		users,
		twoFactor: createTwoFactorService({ auth }),
		logger,
		payments,
		videoHost,
		mailer,
		limiter,
		media: createMediaService({ db, videoHost, log: logger }),
		content,
		catalog,
		entitlements,
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
		commerce: {
			pricing,
			promo,
			cart,
			// `Secure` whenever the site is served over https (not on http://localhost).
			cartCookie: createCartCookie({
				secret: config.betterAuthSecret,
				secure: config.siteUrl.startsWith('https://')
			}),
			orders,
			fulfilment
		},
		admin: createAdminService({
			db,
			auth,
			users,
			entitlements,
			orders,
			fulfilment,
			catalog,
			gateway: payments,
			log: logger
		}),
		googleEnabled: config.google !== undefined,
		cronSecret: config.cronSecret
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
