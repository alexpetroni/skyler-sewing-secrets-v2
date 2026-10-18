import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { DomainError } from '#lib/server/modules/errors.ts';
import { schema } from '#lib/server/db/index.ts';
import { createAuthService } from './service.ts';

const { users, accounts, profiles, sessions, audit_log } = schema;

describe('createAuthService', () => {
	const { db } = useTestDb();
	const service = () => createAuthService({ db: db() });

	async function createActor(): Promise<string> {
		const actorId = await service().createCredentialUser({
			email: 'actor@example.com',
			password: 'actor-password',
			fullName: 'Actor'
		});
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, actorId));
		// `setAdmin` requires the actor to have two-factor authentication on.
		await db().update(users).set({ twoFactorEnabled: true }).where(eq(users.id, actorId));
		return actorId;
	}

	async function addSession(userId: string): Promise<void> {
		await db()
			.insert(sessions)
			.values({
				userId,
				token: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 60_000)
			});
	}

	describe('createCredentialUser', () => {
		it('creates users, accounts and profiles rows with a lower-cased, unverified email', async () => {
			const userId = await service().createCredentialUser({
				email: 'New.Member@Example.COM',
				password: 'correct horse battery staple',
				fullName: 'New Member'
			});

			const [user] = await db().select().from(users).where(eq(users.id, userId));
			expect(user.email).toBe('new.member@example.com');
			expect(user.emailVerified).toBe(false);
			expect(user.name).toBe('New Member');

			const [account] = await db().select().from(accounts).where(eq(accounts.userId, userId));
			expect(account.providerId).toBe('credential');
			expect(account.accountId).toBe(userId);
			expect(account.password).toMatch(/^\$2[aby]\$10\$/);
			expect(account.password).not.toContain('correct horse');

			const [profile] = await db().select().from(profiles).where(eq(profiles.id, userId));
			expect(profile.email).toBe('new.member@example.com');
			expect(profile.full_name).toBe('New Member');
			expect(profile.is_admin).toBe(false);
			expect(profile.is_member).toBe(false);
			expect(profile.is_suspended).toBe(false);
		});

		it('throws on a duplicate email (case-insensitively) and leaves no partial rows', async () => {
			await service().createCredentialUser({ email: 'dupe@example.com', password: 'first' });

			await expect(
				service().createCredentialUser({ email: 'DUPE@example.com', password: 'second' })
			).rejects.toThrow();

			expect(await db().select().from(users)).toHaveLength(1);
			expect(await db().select().from(accounts)).toHaveLength(1);
			expect(await db().select().from(profiles)).toHaveLength(1);
		});
	});

	it('findUserIdByEmail matches case-insensitively and returns null when absent', async () => {
		const userId = await service().createCredentialUser({
			email: 'find@example.com',
			password: 'x'
		});

		expect(await service().findUserIdByEmail('FIND@example.com')).toBe(userId);
		expect(await service().findUserIdByEmail('nobody@example.com')).toBeNull();
	});

	it('markEmailVerified flips the flag', async () => {
		const userId = await service().createCredentialUser({
			email: 'verify@example.com',
			password: 'x'
		});

		await service().markEmailVerified(userId);

		const [user] = await db().select().from(users).where(eq(users.id, userId));
		expect(user.emailVerified).toBe(true);
	});

	it('ensureProfile inserts a missing profile and leaves an existing one alone', async () => {
		const userId = await service().createCredentialUser({
			email: 'heal@example.com',
			password: 'x',
			fullName: 'Original'
		});
		await db().delete(profiles).where(eq(profiles.id, userId));

		await service().ensureProfile({ userId, email: 'Heal@Example.com', fullName: 'Healed' });
		await service().ensureProfile({ userId, email: 'heal@example.com', fullName: 'Ignored' });

		const profile = await service().getProfile(userId);
		expect(profile?.email).toBe('heal@example.com');
		expect(profile?.full_name).toBe('Healed');
	});

	it('updateProfile changes the profile name and keeps users.name in step', async () => {
		const userId = await service().createCredentialUser({
			email: 'rename@example.com',
			password: 'x',
			fullName: 'Before'
		});

		const profile = await service().updateProfile(userId, { fullName: 'After' });

		expect(profile.full_name).toBe('After');
		const [user] = await db().select().from(users).where(eq(users.id, userId));
		expect(user.name).toBe('After');
	});

	describe('suspend', () => {
		it('sets the flags, deletes the sessions and writes audit_log', async () => {
			const actorId = await createActor();
			const userId = await service().createCredentialUser({
				email: 'member@example.com',
				password: 'x'
			});
			await addSession(userId);
			await addSession(userId);
			await addSession(actorId);

			const profile = await service().suspend(userId, 'Chargeback', actorId);

			expect(profile.is_suspended).toBe(true);
			expect(profile.suspended_reason).toBe('Chargeback');
			expect(profile.suspended_at).not.toBeNull();

			expect(await db().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
			expect(await db().select().from(sessions).where(eq(sessions.userId, actorId))).toHaveLength(
				1
			);

			const entries = await db().select().from(audit_log);
			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({
				actor_id: actorId,
				action: 'user.suspend',
				entity: 'profile',
				entity_id: userId,
				before: { is_suspended: false, suspended_reason: null },
				after: { is_suspended: true, suspended_reason: 'Chargeback' }
			});
		});

		it('refuses to suspend an admin and changes nothing', async () => {
			const actorId = await createActor();
			const adminId = await service().createCredentialUser({
				email: 'admin2@example.com',
				password: 'x'
			});
			await service().setAdmin(adminId, true, actorId);
			await addSession(adminId);

			await expect(service().suspend(adminId, 'nope', actorId)).rejects.toThrow(/admin/);

			const profile = await service().getProfile(adminId);
			expect(profile?.is_suspended).toBe(false);
			expect(await db().select().from(sessions).where(eq(sessions.userId, adminId))).toHaveLength(
				1
			);
			const suspendEntries = (await db().select().from(audit_log)).filter(
				(entry) => entry.action === 'user.suspend'
			);
			expect(suspendEntries).toHaveLength(0);
		});

		it('unsuspend clears the flags and writes audit_log', async () => {
			const actorId = await createActor();
			const userId = await service().createCredentialUser({
				email: 'back@example.com',
				password: 'x'
			});
			await service().suspend(userId, 'Mistake', actorId);

			const profile = await service().unsuspend(userId, actorId);

			expect(profile.is_suspended).toBe(false);
			expect(profile.suspended_reason).toBeNull();
			expect(profile.suspended_at).toBeNull();
			const actions = (await db().select().from(audit_log)).map((entry) => entry.action);
			expect(actions).toEqual(['user.suspend', 'user.unsuspend']);
		});
	});

	it('trimSessions keeps the newest `keep` sessions of the user only', async () => {
		const userId = await service().createCredentialUser({
			email: 'many@example.com',
			password: 'x'
		});
		const otherId = await service().createCredentialUser({
			email: 'other@example.com',
			password: 'x'
		});
		const base = Date.now();
		for (let i = 0; i < 7; i++) {
			await db()
				.insert(sessions)
				.values({
					userId,
					token: `token-${i}`,
					createdAt: new Date(base + i * 1000),
					expiresAt: new Date(base + 86_400_000)
				});
		}
		await addSession(otherId);

		expect(await service().trimSessions(userId, 5)).toBe(2);

		const kept = await db()
			.select({ token: sessions.token })
			.from(sessions)
			.where(eq(sessions.userId, userId))
			.orderBy(sessions.token);
		expect(kept.map((row) => row.token)).toEqual([
			'token-2',
			'token-3',
			'token-4',
			'token-5',
			'token-6'
		]);
		expect(await db().select().from(sessions).where(eq(sessions.userId, otherId))).toHaveLength(1);
		// Nothing to trim: no rows touched.
		expect(await service().trimSessions(userId, 5)).toBe(0);
	});

	it('setAdmin refuses an actor without two-factor authentication and changes nothing', async () => {
		const actorId = await createActor();
		await db().update(users).set({ twoFactorEnabled: false }).where(eq(users.id, actorId));
		const userId = await service().createCredentialUser({
			email: 'promote@example.com',
			password: 'x'
		});

		const refusal = await service()
			.setAdmin(userId, true, actorId)
			.catch((err: unknown) => err);
		expect(refusal).toBeInstanceOf(DomainError);
		expect(refusal).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });
		expect((await service().getProfile(userId))?.is_admin).toBe(false);
		expect(await db().select().from(audit_log)).toEqual([]);
	});

	it('setAdmin updates the flag and writes audit_log with before/after', async () => {
		const actorId = await createActor();
		const userId = await service().createCredentialUser({
			email: 'promote@example.com',
			password: 'x'
		});

		const promoted = await service().setAdmin(userId, true, actorId);
		expect(promoted.is_admin).toBe(true);

		const demoted = await service().setAdmin(userId, false, actorId);
		expect(demoted.is_admin).toBe(false);

		const entries = await db().select().from(audit_log).where(eq(audit_log.entity_id, userId));
		expect(entries.map((entry) => [entry.action, entry.before, entry.after])).toEqual([
			['user.set_admin', { is_admin: false }, { is_admin: true }],
			['user.set_admin', { is_admin: true }, { is_admin: false }]
		]);
		expect(entries.every((entry) => entry.actor_id === actorId)).toBe(true);
	});

	it('revokeAllSessions deletes only that user’s sessions', async () => {
		const a = await service().createCredentialUser({ email: 'a@example.com', password: 'x' });
		const b = await service().createCredentialUser({ email: 'b@example.com', password: 'x' });
		await addSession(a);
		await addSession(b);

		await service().revokeAllSessions(a);

		expect(await db().select().from(sessions).where(eq(sessions.userId, a))).toHaveLength(0);
		expect(await db().select().from(sessions).where(eq(sessions.userId, b))).toHaveLength(1);
	});
});
