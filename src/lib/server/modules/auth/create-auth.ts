import { getRequestEvent } from '$app/server';
import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { schema, type Db } from '#lib/server/db/index.ts';

export interface CreateAuthOptions {
	db: Db;
	secret: string;
	/** Public origin of the site; also the base of password-reset links. */
	baseURL: string;
	/** Google sign-in is offered only when both keys are configured. */
	google?: { clientId: string; clientSecret: string };
	/** Delivers the reset email; the mailer is injected so no module reads env or performs I/O here. */
	sendPasswordReset: (to: string, url: string) => Promise<void>;
}

/** bcrypt cost used by Supabase Auth, whose hashes were migrated unchanged. */
const BCRYPT_COST = 10;

export function createAuth(options: CreateAuthOptions) {
	const { db, secret, baseURL, google, sendPasswordReset } = options;

	return betterAuth({
		baseURL,
		secret,
		database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
		advanced: {
			database: {
				// Tables use uuid primary keys (profiles.id and every user FK were
				// migrated from Supabase as UUIDs).
				generateId: () => crypto.randomUUID()
			}
		},
		emailAndPassword: {
			enabled: true,
			// Accounts are created by checkout and Google sign-in; the public
			// POST /api/auth/sign-up/email endpoint is not part of the product.
			disableSignUp: true,
			// Supabase Auth stored bcrypt hashes; keeping bcrypt means imported
			// users sign in with their existing passwords.
			password: {
				hash: (password) => bcrypt.hash(password, BCRYPT_COST),
				verify: ({ hash, password }) => bcrypt.compare(password, hash)
			},
			resetPasswordTokenExpiresIn: 60 * 60,
			// A reset must end every session an attacker may hold on a
			// pre-registered account (security audit H3).
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, token }) => {
				await sendPasswordReset(user.email, `${baseURL}/auth/reset-password?token=${token}`);
			}
		},
		socialProviders: google
			? { google: { clientId: google.clientId, clientSecret: google.clientSecret } }
			: {},
		account: {
			accountLinking: {
				enabled: true,
				// Google reports verified emails, so a Google sign-in may attach to
				// an existing imported user with the same email even when no
				// accounts row was migrated for them.
				trustedProviders: ['google']
			}
		},
		// Serverless instances share no memory, so the limiter counts in the
		// `rate_limits` table (security audit H5).
		rateLimit: {
			enabled: true,
			storage: 'database',
			window: 10,
			max: 100,
			customRules: {
				'/sign-in/email': { window: 60, max: 10 },
				'/request-password-reset': { window: 300, max: 5 }
			}
		},
		databaseHooks: {
			user: {
				create: {
					// Replaces the Supabase handle_new_user trigger on auth.users
					after: async (user) => {
						await db
							.insert(schema.profiles)
							.values({
								id: user.id,
								email: user.email,
								full_name: user.name || null,
								avatar_url: user.image || null
							})
							.onConflictDoNothing();
					}
				}
			}
		},
		plugins: [twoFactor(), sveltekitCookies(getRequestEvent)]
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session']['session'];
export type AuthUser = Auth['$Infer']['Session']['user'];
