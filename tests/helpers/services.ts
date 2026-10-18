import { createAdminService } from '../../src/lib/server/modules/admin/index.ts';
import {
	createAuth,
	createAuthService,
	createTwoFactorService
} from '../../src/lib/server/modules/auth/index.ts';
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
import {
	createFakeStorage,
	type FakeStorage
} from '../../src/lib/server/platform/fakes/storage.ts';
import { createCatalogService } from '../../src/lib/server/modules/catalog/index.ts';
import {
	createCartCookie,
	createCartService,
	createFulfilmentService,
	createOrderService,
	createPromoService,
	pricing
} from '../../src/lib/server/modules/commerce/index.ts';
import { createContentService } from '../../src/lib/server/modules/content/index.ts';
import { createEntitlementService } from '../../src/lib/server/modules/entitlements/index.ts';
import {
	createMarketingService,
	signInCodeEmail
} from '../../src/lib/server/modules/marketing/index.ts';
import { createMediaService } from '../../src/lib/server/modules/media/index.ts';
import type { FakeTurnstile } from '../../src/lib/server/platform/fakes/turnstile.ts';
import { createRequestLimiter } from '../../src/lib/server/platform/request-limits.ts';
import type { Services } from '../../src/lib/server/runtime/container.ts';

export const TEST_SITE_URL = 'http://localhost:5173';
export const TEST_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth';
export const TEST_CONTACT_EMAIL = 'inbox@skylersewingsecrets.test';
export const TEST_CRON_SECRET = 'test-cron-secret';

export type { LogEntry };

export interface TestServices extends Services {
	payments: FakePaymentGateway;
	videoHost: FakeVideoHost;
	storage: FakeStorage;
	mailer: FakeMailer;
	/** Reset emails the fake mailer "sent". */
	resetEmails: Array<{ to: string; url: string }>;
	logEntries: LogEntry[];
}

export interface TestServiceOverrides {
	googleEnabled?: boolean;
	/** A video host prepared by the test (e.g. with a fixed clock). */
	videoHost?: FakeVideoHost;
	/** Turnstile "configured" with this fake; absent means not configured. */
	turnstile?: FakeTurnstile;
	/** Clock for the request limiter and the marketing service. */
	now?: () => Date;
}

/**
 * Every service built so far on the given PGlite database: real Better Auth
 * and domain services, with in-memory fakes for the video host, payment
 * gateway, mailer and logger. Files that use it mock `$app/server` so the
 * sveltekitCookies plugin finds no request event (or the fake one).
 */
export function createTestServices(db: Db, overrides: TestServiceOverrides = {}): TestServices {
	const resetEmails: TestServices['resetEmails'] = [];
	const google = overrides.googleEnabled
		? { clientId: 'google-client-id', clientSecret: 'google-client-secret' }
		: undefined;

	const logger = createFakeLogger();
	const videoHost = overrides.videoHost ?? createFakeVideoHost();
	const mailer = createFakeMailer();
	const auth = createAuth({
		db,
		secret: TEST_AUTH_SECRET,
		baseURL: TEST_SITE_URL,
		google,
		sendPasswordReset: async (to, url) => {
			resetEmails.push({ to, url });
		},
		// Through the fake mailer, so tests read the code off the message.
		sendSignInCode: async (to, code) => {
			await mailer.send({ to, ...signInCodeEmail(code, TEST_SITE_URL) });
		}
	});

	const content = createContentService({ db, log: logger });
	const catalog = createCatalogService({ db, content, log: logger });
	const entitlements = createEntitlementService({ db, log: logger });
	const promo = createPromoService({ db, log: logger });
	const cart = createCartService({ catalog, entitlements, promo, log: logger });
	const payments = createFakePaymentGateway();
	const storage = createFakeStorage({
		now: overrides.now ? () => overrides.now!().getTime() : undefined
	});
	const limiter = createRequestLimiter({ db, now: overrides.now });
	const turnstile = overrides.turnstile;
	const users = createAuthService({ db });
	const orders = createOrderService({
		db,
		cart,
		promo,
		catalog,
		gateway: payments,
		log: logger,
		siteUrl: TEST_SITE_URL,
		now: overrides.now
	});

	const fulfilment = createFulfilmentService({
		db,
		orders,
		entitlements,
		auth: users,
		mailer,
		log: logger,
		siteUrl: TEST_SITE_URL,
		now: overrides.now
	});

	return {
		db,
		auth,
		users,
		twoFactor: createTwoFactorService({ auth }),
		logger,
		payments,
		videoHost,
		storage,
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
			siteUrl: TEST_SITE_URL,
			secret: TEST_AUTH_SECRET,
			contactEmail: TEST_CONTACT_EMAIL,
			verifyTurnstile: turnstile ? (token, ip) => turnstile.verify(token, ip) : undefined,
			now: overrides.now
		}),
		commerce: {
			pricing,
			promo,
			cart,
			cartCookie: createCartCookie({ secret: TEST_AUTH_SECRET, secure: false }),
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
			storage,
			log: logger,
			now: overrides.now
		}),
		googleEnabled: google !== undefined,
		cronSecret: TEST_CRON_SECRET,
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
