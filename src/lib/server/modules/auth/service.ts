import bcrypt from 'bcryptjs';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import { DomainError } from '#lib/server/modules/errors.ts';

const {
	users,
	accounts,
	profiles,
	sessions,
	verifications,
	twoFactors,
	audit_log,
	orders,
	order_items,
	entitlements,
	user_progress,
	newsletter_subscribers
} = schema;

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

/** Everything the site holds about a person, for the GDPR export. */
export interface AccountExport {
	exportedAt: string;
	profile: {
		id: string;
		email: string;
		fullName: string | null;
		avatarUrl: string | null;
		isMember: boolean;
		memberSince: string | null;
		createdAt: string;
	};
	orders: Array<{
		id: string;
		status: string;
		currency: string;
		subtotal: number;
		discountTotal: number;
		total: number;
		createdAt: string;
		paidAt: string | null;
		items: Array<{
			productId: string;
			productTitle: string;
			listPrice: number;
			unitPrice: number;
			discountAmount: number;
			refundedAmount: number;
		}>;
	}>;
	entitlements: Array<{
		id: string;
		productId: string;
		source: string;
		grantedAt: string;
		revokedAt: string | null;
	}>;
	progress: Array<{
		lessonId: string;
		completed: boolean;
		completedAt: string | null;
		lastPositionSeconds: number;
		updatedAt: string;
	}>;
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
	/** Flags the address as verified; runs in `tx` when the caller holds one. */
	markEmailVerified(userId: string, tx?: Tx): Promise<void>;
	/** Defensive fallback kept from the Supabase days: inserts a missing profile row. */
	ensureProfile(input: EnsureProfileInput): Promise<void>;
	getProfile(userId: string): Promise<Profile | null>;
	updateProfile(userId: string, patch: { fullName: string | null }): Promise<Profile>;
	/** Refuses admins; sets the flags, ends every session and records the change. */
	suspend(userId: string, reason: string, actorId: string): Promise<Profile>;
	unsuspend(userId: string, actorId: string): Promise<Profile>;
	/** Refuses unless the actor has two-factor authentication on (`TWO_FACTOR_REQUIRED`). */
	setAdmin(userId: string, isAdmin: boolean, actorId: string): Promise<Profile>;
	revokeAllSessions(userId: string): Promise<void>;
	/** Keeps the `keep` newest sessions of the user and deletes the rest. */
	trimSessions(userId: string, keep: number): Promise<number>;
	/**
	 * Whether the account for `email` may be claimed with an emailed code at
	 * checkout: it exists, its email is unverified and it has no orders.
	 * Anyone else is asked to sign in.
	 */
	claimable(email: string): Promise<boolean>;
	/** Whether a credential (password) account exists; Google-only accounts have none. */
	hasPassword(userId: string): Promise<boolean>;
	/** bcrypt check against the credential account; false when there is none. */
	verifyPassword(userId: string, password: string): Promise<boolean>;
	/** The profile, orders with items, entitlements and lesson progress, for download. */
	exportData(userId: string): Promise<AccountExport | null>;
	/**
	 * GDPR deletion. Personal data is blanked (`deleted-<id>@invalid.local`,
	 * no name, no image), accounts, sessions, verifications and TOTP rows are
	 * deleted, the profile is suspended with reason `deleted`, every
	 * entitlement is revoked and the newsletter row for the address removed.
	 * Orders and their items stay for accounting. Refuses admins
	 * (`USER_IS_ADMIN`). One audit row, `actor` = the user or the admin.
	 */
	anonymise(userId: string, actorId: string): Promise<void>;
}

/** The address an anonymised account is left with. */
export function anonymisedEmail(userId: string): string {
	return `deleted-${userId}@invalid.local`;
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

	async function credentialHash(userId: string): Promise<string | null> {
		const [row] = await db
			.select({ password: accounts.password })
			.from(accounts)
			.where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
			.limit(1);
		return row?.password ?? null;
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

		async markEmailVerified(userId, tx) {
			await (tx ?? db)
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
				const [actor] = await tx
					.select({ twoFactorEnabled: users.twoFactorEnabled })
					.from(users)
					.where(eq(users.id, actorId))
					.limit(1);
				if (!actor?.twoFactorEnabled) {
					throw new DomainError(
						'TWO_FACTOR_REQUIRED',
						'Turn on two-factor authentication for your own account before changing admin access'
					);
				}
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
		},

		async claimable(email) {
			const [user] = await db
				.select({ id: users.id, emailVerified: users.emailVerified })
				.from(users)
				.where(sql`lower(${users.email}) = lower(${email})`)
				.limit(1);
			if (!user || user.emailVerified) return false;
			const [order] = await db
				.select({ id: orders.id })
				.from(orders)
				.where(eq(orders.user_id, user.id))
				.limit(1);
			return order === undefined;
		},

		async hasPassword(userId) {
			return (await credentialHash(userId)) !== null;
		},

		async verifyPassword(userId, password) {
			const hash = await credentialHash(userId);
			return hash !== null && (await bcrypt.compare(password, hash));
		},

		async exportData(userId) {
			const profile = await loadProfile(db, userId);
			if (!profile) return null;
			const [orderRows, itemRows, entitlementRows, progressRows] = await Promise.all([
				db.select().from(orders).where(eq(orders.user_id, userId)).orderBy(orders.created_at),
				db
					.select({ item: order_items })
					.from(order_items)
					.innerJoin(orders, eq(order_items.order_id, orders.id))
					.where(eq(orders.user_id, userId)),
				db
					.select()
					.from(entitlements)
					.where(eq(entitlements.user_id, userId))
					.orderBy(entitlements.granted_at),
				db
					.select()
					.from(user_progress)
					.where(eq(user_progress.user_id, userId))
					.orderBy(user_progress.updated_at)
			]);
			return {
				exportedAt: new Date().toISOString(),
				profile: {
					id: profile.id,
					email: profile.email,
					fullName: profile.full_name,
					avatarUrl: profile.avatar_url,
					isMember: profile.is_member,
					memberSince: profile.member_since,
					createdAt: profile.created_at
				},
				orders: orderRows.map((order) => ({
					id: order.id,
					status: order.status,
					currency: order.currency,
					subtotal: order.subtotal,
					discountTotal: order.discount_total,
					total: order.total,
					createdAt: order.created_at,
					paidAt: order.paid_at,
					items: itemRows
						.filter(({ item }) => item.order_id === order.id)
						.map(({ item }) => ({
							productId: item.product_id,
							productTitle: item.product_title,
							listPrice: item.list_price,
							unitPrice: item.unit_price,
							discountAmount: item.discount_amount,
							refundedAmount: item.refunded_amount
						}))
				})),
				entitlements: entitlementRows.map((row) => ({
					id: row.id,
					productId: row.product_id,
					source: row.source,
					grantedAt: row.granted_at,
					revokedAt: row.revoked_at
				})),
				progress: progressRows.map((row) => ({
					lessonId: row.lesson_id,
					completed: row.completed,
					completedAt: row.completed_at,
					lastPositionSeconds: row.last_position_seconds,
					updatedAt: row.updated_at
				}))
			};
		},

		anonymise(userId, actorId) {
			return withTx(db, async (tx) => {
				const before = await requireProfile(tx, userId);
				if (before.is_admin) {
					throw new DomainError(
						'USER_IS_ADMIN',
						'An admin account cannot be deleted; remove admin first'
					);
				}
				const [account] = await tx
					.select({ email: users.email })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				const email = (account?.email ?? before.email).toLowerCase();
				const deletedEmail = anonymisedEmail(userId);

				await tx
					.update(users)
					.set({
						email: deletedEmail,
						name: '',
						image: null,
						emailVerified: false,
						twoFactorEnabled: false,
						updatedAt: new Date()
					})
					.where(eq(users.id, userId));
				await tx.delete(accounts).where(eq(accounts.userId, userId));
				await tx.delete(sessions).where(eq(sessions.userId, userId));
				await tx.delete(twoFactors).where(eq(twoFactors.userId, userId));
				// Better Auth keys reset and two-factor tokens by user id and
				// email codes by `<type>-otp-<email>`.
				await tx
					.delete(verifications)
					.where(
						or(
							eq(verifications.value, userId),
							sql`right(${verifications.identifier}, ${email.length}) = ${email}`
						)
					);
				await tx
					.update(profiles)
					.set({
						email: deletedEmail,
						full_name: null,
						avatar_url: null,
						is_member: false,
						is_suspended: true,
						suspended_reason: 'deleted',
						suspended_at: sql`now()`,
						updated_at: sql`now()`
					})
					.where(eq(profiles.id, userId));
				const revoked = await tx
					.update(entitlements)
					.set({ revoked_at: sql`now()`, revoke_reason: 'account deleted' })
					.where(and(eq(entitlements.user_id, userId), isNull(entitlements.revoked_at)))
					.returning({ id: entitlements.id });
				await tx
					.delete(newsletter_subscribers)
					.where(sql`lower(${newsletter_subscribers.email}) = ${email}`);
				// No personal data in the audit row.
				await writeAudit(tx, {
					actorId,
					action: 'user.anonymise',
					userId,
					before: { is_suspended: before.is_suspended, is_member: before.is_member },
					after: {
						is_suspended: true,
						suspended_reason: 'deleted',
						is_member: false,
						entitlements_revoked: revoked.length,
						by: actorId === userId ? 'self' : 'admin'
					}
				});
			});
		},

		async trimSessions(userId, keep) {
			const kept = db
				.select({ id: sessions.id })
				.from(sessions)
				.where(eq(sessions.userId, userId))
				.orderBy(desc(sessions.createdAt), desc(sessions.id))
				.limit(keep);
			const removed = await db
				.delete(sessions)
				.where(sql`${sessions.userId} = ${userId} AND ${sessions.id} NOT IN (${kept})`)
				.returning({ id: sessions.id });
			return removed.length;
		}
	};
}
