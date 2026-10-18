import * as privateEnv from '$app/env/private';
import { PUBLIC_BUNNY_CDN_URL, PUBLIC_SITE_URL, PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
import type { DbDriver } from '#lib/server/db/index.ts';

/**
 * Typed runtime configuration. This file is the only importer of
 * `$app/env/private` under `src/lib`; everything else receives configuration
 * as arguments from the container.
 */
export interface RuntimeConfig {
	siteUrl: string;
	databaseUrl: string;
	databaseDriver: DbDriver;
	betterAuthSecret: string;
	/** Present only when both Google OAuth keys are configured. */
	google?: { clientId: string; clientSecret: string };
	stripe: { secretKey: string; webhookSecret: string };
	resend: { apiKey: string; fromEmail: string };
	bunny: {
		videoLibraryId: string;
		videoApiKey: string;
		embedTokenKey: string;
		streamCdnHost: string;
		publicCdnUrl: string;
		storageZone: string;
		storageApiKey: string;
	};
	contactEmail: string;
	cronSecret: string;
	sentryDsn?: string;
	turnstile?: { siteKey: string; secretKey: string };
	revalidateBypassToken?: string;
}

/**
 * `src/env.ts` declares the required variables as optional while building so
 * that `npm run build` needs no environment; at runtime the schema has already
 * rejected a missing value, so this only narrows the type.
 */
function required(name: string, value: string | undefined): string {
	if (value === undefined || value === '') {
		throw new Error(`Environment variable ${name} is not set`);
	}
	return value;
}

function blankToUndefined(value: string | undefined): string | undefined {
	return value === undefined || value === '' ? undefined : value;
}

/** Reads the environment into a `RuntimeConfig`. Called lazily, never at import time. */
export function getRuntimeConfig(): RuntimeConfig {
	const googleClientId = blankToUndefined(privateEnv.GOOGLE_CLIENT_ID);
	const googleClientSecret = blankToUndefined(privateEnv.GOOGLE_CLIENT_SECRET);
	const turnstileSiteKey = blankToUndefined(PUBLIC_TURNSTILE_SITE_KEY);
	const turnstileSecretKey = blankToUndefined(privateEnv.TURNSTILE_SECRET_KEY);

	return {
		siteUrl: required('PUBLIC_SITE_URL', PUBLIC_SITE_URL),
		databaseUrl: required('DATABASE_URL', privateEnv.DATABASE_URL),
		databaseDriver: privateEnv.DATABASE_DRIVER,
		betterAuthSecret: required('BETTER_AUTH_SECRET', privateEnv.BETTER_AUTH_SECRET),
		google:
			googleClientId && googleClientSecret
				? { clientId: googleClientId, clientSecret: googleClientSecret }
				: undefined,
		stripe: {
			secretKey: required('STRIPE_SECRET_KEY', privateEnv.STRIPE_SECRET_KEY),
			webhookSecret: required('STRIPE_WEBHOOK_SECRET', privateEnv.STRIPE_WEBHOOK_SECRET)
		},
		resend: {
			apiKey: required('RESEND_API_KEY', privateEnv.RESEND_API_KEY),
			fromEmail: required('RESEND_FROM_EMAIL', privateEnv.RESEND_FROM_EMAIL)
		},
		bunny: {
			videoLibraryId: required('BUNNY_VIDEO_LIBRARY_ID', privateEnv.BUNNY_VIDEO_LIBRARY_ID),
			videoApiKey: required('BUNNY_VIDEO_API_KEY', privateEnv.BUNNY_VIDEO_API_KEY),
			embedTokenKey: required('BUNNY_EMBED_TOKEN_KEY', privateEnv.BUNNY_EMBED_TOKEN_KEY),
			streamCdnHost: required('BUNNY_STREAM_CDN_HOST', privateEnv.BUNNY_STREAM_CDN_HOST),
			publicCdnUrl: required('PUBLIC_BUNNY_CDN_URL', PUBLIC_BUNNY_CDN_URL),
			storageZone: required('BUNNY_STORAGE_ZONE', privateEnv.BUNNY_STORAGE_ZONE),
			storageApiKey: required('BUNNY_STORAGE_API_KEY', privateEnv.BUNNY_STORAGE_API_KEY)
		},
		contactEmail: required('CONTACT_EMAIL', privateEnv.CONTACT_EMAIL),
		cronSecret: required('CRON_SECRET', privateEnv.CRON_SECRET),
		sentryDsn: blankToUndefined(privateEnv.SENTRY_DSN),
		turnstile:
			turnstileSiteKey && turnstileSecretKey
				? { siteKey: turnstileSiteKey, secretKey: turnstileSecretKey }
				: undefined,
		revalidateBypassToken: blankToUndefined(privateEnv.REVALIDATE_BYPASS_TOKEN)
	};
}
