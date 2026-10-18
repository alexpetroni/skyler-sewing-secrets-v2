import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import bcrypt from 'bcryptjs';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { getDb } from './db';
import * as schema from './db/schema';
import { sendEmail, passwordResetEmail } from './email';

function createAuth() {
	// Same fallback the email templates use, so baseURL and reset links
	// can never disagree
	const siteUrl = publicEnv.PUBLIC_SITE_URL || 'https://skylersewingsecrets.com';

	return betterAuth({
		baseURL: siteUrl,
		secret: privateEnv.BETTER_AUTH_SECRET,
		database: drizzleAdapter(getDb(), {
			provider: 'pg',
			usePlural: true,
			schema
		}),
		advanced: {
			database: {
				// Tables use uuid primary keys (profiles.id and every user FK
				// were migrated from Supabase as UUIDs)
				generateId: () => crypto.randomUUID()
			}
		},
		emailAndPassword: {
			enabled: true,
			// Accounts are created by checkout, the Stripe webhook and Google
			// sign-in; the public POST /api/auth/sign-up/email endpoint is not
			// part of the product. Sign-in, requestPasswordReset, resetPassword
			// and signInEmail are unaffected by this flag.
			disableSignUp: true,
			// Supabase Auth stored bcrypt hashes; keeping bcrypt means users
			// imported from auth.users sign in with their existing passwords.
			password: {
				hash: async (password) => bcrypt.hash(password, 10),
				verify: async ({ hash, password }) => bcrypt.compare(password, hash)
			},
			resetPasswordTokenExpiresIn: 60 * 60,
			sendResetPassword: async ({ user, token }) => {
				const resetUrl = `${siteUrl}/auth/reset-password?token=${token}`;
				const { subject, html, text } = passwordResetEmail(resetUrl);
				await sendEmail({ to: user.email, subject, html, text });
			}
		},
		socialProviders: {
			google: {
				clientId: privateEnv.GOOGLE_CLIENT_ID || '',
				clientSecret: privateEnv.GOOGLE_CLIENT_SECRET || ''
			}
		},
		account: {
			accountLinking: {
				enabled: true,
				// Google reports verified emails, so a Google sign-in may attach
				// to an existing imported user with the same email even when no
				// accounts row was migrated for them.
				trustedProviders: ['google']
			}
		},
		databaseHooks: {
			user: {
				create: {
					// Replaces the Supabase handle_new_user trigger on auth.users
					after: async (user) => {
						await getDb()
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
		plugins: [sveltekitCookies(getRequestEvent)]
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session']['session'];
export type AuthUser = Auth['$Infer']['Session']['user'];

let _auth: Auth | null = null;

/**
 * Lazily create the Better Auth instance so importing this module never
 * requires DATABASE_URL/BETTER_AUTH_SECRET at build time.
 */
export function getAuth(): Auth {
	if (!_auth) {
		_auth = createAuth();
	}
	return _auth;
}
