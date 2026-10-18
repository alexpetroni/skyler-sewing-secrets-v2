import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';

const { users, accounts, profiles, sessions, audit_log } = schema;

export type Profile = typeof profiles.$inferSelect;

export interface CreateCredentialUserInput {
	email: string;
	password: string;
	fullName?: string | null;
}

export interface EnsureProfileInput {
	userId: string;
	email: string;
	fullName?: string | null;
}

export interface AuthService {
	findUserIdByEmail(email: string): Promise<string | null>;
	/**
	 * Writes the rows Better Auth itself would create (users, credential
	 * account, profile) so the user signs in through Better Auth normally.
	 * The email stays unverified until Stripe confirms the paid address or the
	 * user proves control of it (security audit H3).
	 */
	createCredentialUser(input: CreateCredentialUserInput): Promise<string>;
	markEmailVerified(userId: string): Promise<void>;
	/** Defensive fallback kept from the Supabase days: inserts a missing profile row. */
	ensureProfile(input: EnsureProfileInput): Promise<void>;
	getProfile(userId: string): Promise<Profile | null>;
	updateProfile(userId: string, patch: { fullName: string | null }): Promise<Profile>;
	/** Refuses admins; sets the flags, ends every session and records the change. */
	suspend(userId: string, reason: string, actorId: string): Promise<Profile>;
	unsuspend(userId: string, actorId: string): Promise<Profile>;
	setAdmin(userId: string, isAdmin: boolean, actorId: string): Promise<Profile>;
	revokeAllSessions(userId: string): Promise<void>;
}

/** bcrypt cost used by Supabase Auth, whose hashes were migrated unchanged. */
const BCRYPT_COST = 10;

export function createAuthService({ db }: { db: Db }): AuthService {
	async function loadProfile(executor: Db | Tx, userId: string): Promise<Profile | null> {
		const [row] = await executor.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
		return row ?? null;
	}

	async function requireProfile(executor: Db | Tx, userId: string): Promise<Profile> {
		const profile = await loadProfile(executor, userId);
		if (!profile) throw new Error(`Profile ${userId} not found`);
		return profile;
	}

	async function writeAudit(
		tx: Tx,
		entry: {
			actorId: string;
			action: string;
			userId: string;
			before: Record<string, unknown>;
			after: Record<string, unknown>;
		}
	): Promise<void> {
		await tx.insert(audit_log).values({
			actor_id: entry.actorId,
			action: entry.action,
			entity: 'profile',
			entity_id: entry.userId,
			before: entry.before,
			after: entry.after
		});
	}

	return {
		async findUserIdByEmail(email) {
			const [row] = await db
				.select({ id: users.id })
				.from(users)
				.where(sql`lower(${users.email}) = lower(${email})`)
				.limit(1);
			return row?.id ?? null;
		},

		async createCredentialUser({ email, password, fullName }) {
			const userId = crypto.randomUUID();
			const normalisedEmail = email.trim().toLowerCase();
			const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

			await withTx(db, async (tx) => {
				await tx.insert(users).values({
					id: userId,
					name: fullName || '',
					email: normalisedEmail,
					emailVerified: false
				});
				// Better Auth stores credential password hashes on the account row,
				// with accountId = userId for the 'credential' provider.
				await tx.insert(accounts).values({
					userId,
					accountId: userId,
					providerId: 'credential',
					password: passwordHash
				});
				await tx
					.insert(profiles)
					.values({ id: userId, email: normalisedEmail, full_name: fullName || null })
					.onConflictDoNothing();
			});

			return userId;
		},

		async markEmailVerified(userId) {
			await db
				.update(users)
				.set({ emailVerified: true, updatedAt: new Date() })
				.where(eq(users.id, userId));
		},

		async ensureProfile({ userId, email, fullName }) {
			await db
				.insert(profiles)
				.values({ id: userId, email: email.toLowerCase(), full_name: fullName || null })
				.onConflictDoNothing();
		},

		getProfile(userId) {
			return loadProfile(db, userId);
		},

		updateProfile(userId, { fullName }) {
			return withTx(db, async (tx) => {
				await tx
					.update(users)
					.set({ name: fullName ?? '', updatedAt: new Date() })
					.where(eq(users.id, userId));
				const [profile] = await tx
					.update(profiles)
					.set({ full_name: fullName, updated_at: sql`now()` })
					.where(eq(profiles.id, userId))
					.returning();
				if (!profile) throw new Error(`Profile ${userId} not found`);
				return profile;
			});
		},

		suspend(userId, reason, actorId) {
			return withTx(db, async (tx) => {
				const before = await requireProfile(tx, userId);
				if (before.is_admin) {
					throw new Error('An admin account cannot be suspended; remove admin first');
				}
				const [after] = await tx
					.update(profiles)
					.set({
						is_suspended: true,
						suspended_reason: reason,
						suspended_at: sql`now()`,
						updated_at: sql`now()`
					})
					.where(eq(profiles.id, userId))
					.returning();
				await tx.delete(sessions).where(eq(sessions.userId, userId));
				await writeAudit(tx, {
					actorId,
					action: 'user.suspend',
					userId,
					before: { is_suspended: before.is_suspended, suspended_reason: before.suspended_reason },
					after: { is_suspended: true, suspended_reason: reason }
				});
				return after;
			});
		},

		unsuspend(userId, actorId) {
			return withTx(db, async (tx) => {
				const before = await requireProfile(tx, userId);
				const [after] = await tx
					.update(profiles)
					.set({
						is_suspended: false,
						suspended_reason: null,
						suspended_at: null,
						updated_at: sql`now()`
					})
					.where(eq(profiles.id, userId))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'user.unsuspend',
					userId,
					before: { is_suspended: before.is_suspended, suspended_reason: before.suspended_reason },
					after: { is_suspended: false, suspended_reason: null }
				});
				return after;
			});
		},

		setAdmin(userId, isAdmin, actorId) {
			return withTx(db, async (tx) => {
				const before = await requireProfile(tx, userId);
				const [after] = await tx
					.update(profiles)
					.set({ is_admin: isAdmin, updated_at: sql`now()` })
					.where(eq(profiles.id, userId))
					.returning();
				await writeAudit(tx, {
					actorId,
					action: 'user.set_admin',
					userId,
					before: { is_admin: before.is_admin },
					after: { is_admin: isAdmin }
				});
				return after;
			});
		},

		async revokeAllSessions(userId) {
			await db.delete(sessions).where(eq(sessions.userId, userId));
		}
	};
}
