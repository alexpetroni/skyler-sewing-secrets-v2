import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

/**
 * Required at runtime, but optional while building so that `npm run build`
 * succeeds with no environment variables set.
 */
const required = building ? v.optional(v.string()) : v.pipe(v.string(), v.minLength(1));

/** Required at runtime and must be an absolute URL; optional while building. */
const requiredUrl = building
	? v.optional(v.pipe(v.string(), v.url()))
	: v.pipe(v.string(), v.minLength(1), v.url());

const optional = v.optional(v.string());

export const variables = defineEnvVars({
	// Required at runtime
	DATABASE_URL: {
		schema: required,
		description: 'Postgres connection string (Neon), or pglite://<dir> when DATABASE_DRIVER=pglite'
	},
	BETTER_AUTH_SECRET: {
		schema: required,
		description: 'Secret used by Better Auth to sign sessions and tokens'
	},
	PUBLIC_SITE_URL: {
		public: true,
		schema: requiredUrl,
		description: 'Canonical public origin of the site, e.g. https://skylersewingsecrets.com'
	},
	STRIPE_SECRET_KEY: {
		schema: required,
		description: 'Stripe secret API key used to create Checkout Sessions and refunds'
	},
	STRIPE_WEBHOOK_SECRET: {
		schema: required,
		description: 'Stripe webhook signing secret used to verify incoming events'
	},
	RESEND_API_KEY: {
		schema: required,
		description: 'Resend API key for transactional email'
	},
	RESEND_FROM_EMAIL: {
		schema: required,
		description: 'Sender address for transactional email, e.g. "Skyler <hello@example.com>"'
	},
	BUNNY_VIDEO_LIBRARY_ID: {
		schema: required,
		description: 'Bunny Stream video library id'
	},
	BUNNY_VIDEO_API_KEY: {
		schema: required,
		description: 'Bunny Stream library API key (AccessKey header, TUS upload signatures)'
	},
	BUNNY_EMBED_TOKEN_KEY: {
		schema: required,
		description: 'Bunny Stream embed token authentication key; playback fails closed without it'
	},
	BUNNY_STREAM_CDN_HOST: {
		schema: required,
		description: 'Bunny Stream CDN hostname serving thumbnails and previews'
	},
	PUBLIC_BUNNY_CDN_URL: {
		public: true,
		schema: requiredUrl,
		description: 'Public base URL of the Bunny storage pull zone for images'
	},
	BUNNY_STORAGE_ZONE: {
		schema: required,
		description: 'Bunny Storage zone name for image uploads'
	},
	BUNNY_STORAGE_API_KEY: {
		schema: required,
		description: 'Bunny Storage zone password/API key for image uploads'
	},
	BUNNY_CDN_TOKEN_KEY: {
		schema: optional,
		description:
			'Bunny pull zone token authentication key; download links are signed with it and unsigned when absent'
	},
	CONTACT_EMAIL: {
		schema: required,
		description: 'Inbox that receives contact form submissions'
	},
	CRON_SECRET: {
		schema: required,
		description: 'Bearer secret that authorises Vercel cron requests'
	},

	// Optional
	GOOGLE_CLIENT_ID: {
		schema: optional,
		description: 'Google OAuth client id; Google sign-in is disabled when absent'
	},
	GOOGLE_CLIENT_SECRET: {
		schema: optional,
		description: 'Google OAuth client secret; Google sign-in is disabled when absent'
	},
	SENTRY_DSN: {
		schema: optional,
		description: 'Sentry DSN for error reporting; reporting is disabled when absent'
	},
	PUBLIC_TURNSTILE_SITE_KEY: {
		public: true,
		schema: optional,
		description: 'Cloudflare Turnstile site key for the contact form; challenge off when absent'
	},
	TURNSTILE_SECRET_KEY: {
		schema: optional,
		description: 'Cloudflare Turnstile secret key used to verify challenge responses'
	},
	REVALIDATE_BYPASS_TOKEN: {
		schema: optional,
		description: 'Vercel ISR bypass token used to revalidate cached pages on demand'
	},
	DATABASE_DRIVER: {
		schema: v.optional(v.picklist(['neon', 'pglite']), 'neon'),
		description: 'Database driver: neon (default) in deployment, pglite for local development'
	}
});
