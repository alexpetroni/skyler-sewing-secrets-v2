import { eq } from 'drizzle-orm';
import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import { load as layoutLoad } from '../../src/routes/admin/+layout.server.ts';
import { load as listLoad } from '../../src/routes/admin/users/+page.server.ts';
import { actions, load } from '../../src/routes/admin/users/[id]/+page.server.ts';
import { markTwoFactorEnabled } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD, seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, entitlements, profiles } = schema;

type ActionName = keyof typeof actions;
type ActionEvent = Parameters<(typeof actions)['suspend']>[0];
type LoadEvent = Parameters<typeof load>[0];
type ListEvent = Parameters<typeof listLoad>[0];
type LayoutEvent = Parameters<typeof layoutLoad>[0];
type DetailData = import('../../src/routes/admin/users/[id]/$types').PageServerData;
type ListData = import('../../src/routes/admin/users/$types').PageServerData;

interface FormResult {
	form: { valid: boolean; message?: string; errors: Record<string, string[] | undefined> };
}

/** The status and superforms state of a `fail()` an action returned. */
function failed(result: unknown): { status: number; form: FormResult['form'] } {
	if (!isActionFailure(result)) throw new Error('expected a failure');
	return { status: result.status, form: (result.data as unknown as FormResult).form };
}

describe('/admin/users', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await seeded.services.users.createCredentialUser({
			email: 'owner@example.com',
			password: FIXTURE_PASSWORD,
			fullName: 'Owner'
		});
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, adminId));
		// `setAdmin` requires the actor to have two-factor authentication on.
		await markTwoFactorEnabled(seeded.services, adminId);
	});

	/** Calls the action directly, as SvelteKit does before any layout load runs. */
	async function submit(
		actorId: string | null,
		action: ActionName,
		targetId: string,
		fields: Record<string, string> = {}
	) {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = await memberEvent(seeded.services, actorId, {
			method: 'POST',
			url: `/admin/users/${targetId}?/${action}`,
			body,
			params: { id: targetId }
		});
		return outcome(() => actions[action](event as unknown as ActionEvent));
	}

	const profileOf = async (id: string) =>
		(await db().select().from(profiles).where(eq(profiles.id, id)))[0];
	const auditFor = (action: string) =>
		db().select().from(audit_log).where(eq(audit_log.action, action));

	it('refuses every action to a non-admin with 403 (and a visitor with 401) without the layout running', async () => {
		const { member, nobody } = seeded.users;
		const attempts: Array<[ActionName, Record<string, string>]> = [
			['suspend', { reason: 'Because' }],
			['unsuspend', {}],
			['grant', { productId: seeded.flagship.id, reason: 'Free' }],
			['revoke', { productId: seeded.flagship.id, reason: 'Gone' }],
			['sendReset', {}],
			['setAdmin', { isAdmin: 'true', confirm: 'make admin' }],
			['revokeSessions', {}],
			['anonymise', { confirm: 'delete this account' }]
		];
		for (const [action, fields] of attempts) {
			expect(await submit(nobody.id, action, member.id, fields)).toBe('error 403');
			expect(await submit(null, action, member.id, fields)).toBe('error 401');
		}

		// A suspended admin is not an admin either.
		await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, adminId));
		expect(await submit(adminId, 'suspend', member.id, { reason: 'Because' })).toBe('error 403');

		const target = await profileOf(member.id);
		expect(target).toMatchObject({ is_suspended: false, is_admin: false, is_member: true });
		expect(await profileOf(nobody.id)).toMatchObject({ is_member: false, is_admin: false });
		expect(await db().select().from(audit_log)).toEqual([]);
		expect(seeded.services.resetEmails).toEqual([]);
	});

	it('suspends with a reason: sets the flags, ends sessions and writes the audit row', async () => {
		const { member } = seeded.users;
		const result = (await submit(adminId, 'suspend', member.id, {
			reason: '  Shared their login  '
		})) as FormResult;
		expect(result.form.valid).toBe(true);
		expect(result.form.message).toBe('Account suspended; every session was signed out.');

		expect(await profileOf(member.id)).toMatchObject({
			is_suspended: true,
			suspended_reason: 'Shared their login'
		});
		const [entry] = await auditFor('user.suspend');
		expect(entry).toMatchObject({
			actor_id: adminId,
			entity: 'profile',
			entity_id: member.id,
			after: { is_suspended: true, suspended_reason: 'Shared their login' }
		});

		const restored = (await submit(adminId, 'unsuspend', member.id)) as FormResult;
		expect(restored.form.message).toBe('Account restored.');
		expect((await profileOf(member.id)).is_suspended).toBe(false);
		expect(await auditFor('user.unsuspend')).toHaveLength(1);
	});

	it('rejects a suspension without a reason and an admin target, writing nothing', async () => {
		const { member } = seeded.users;
		const missing = await submit(adminId, 'suspend', member.id, { reason: '   ' });
		expect(failed(missing).status).toBe(400);
		expect(failed(missing).form.errors.reason).toEqual(['Give a reason']);

		const otherAdmin = await seeded.services.users.createCredentialUser({
			email: 'second-admin@example.com',
			password: FIXTURE_PASSWORD
		});
		await db().update(profiles).set({ is_admin: true }).where(eq(profiles.id, otherAdmin));
		const refused = await submit(adminId, 'suspend', otherAdmin, { reason: 'No' });
		expect(failed(refused).status).toBe(400);
		expect(failed(refused).form.errors._errors).toEqual([
			'An admin account cannot be suspended; remove admin first'
		]);

		expect((await profileOf(member.id)).is_suspended).toBe(false);
		expect(await auditFor('user.suspend')).toEqual([]);
		expect(await submit(adminId, 'suspend', 'not-a-uuid', { reason: 'x' })).toBe('error 404');
	});

	it('grants a product as an admin: an admin_grant entitlement with the admin as grantor', async () => {
		const { nobody } = seeded.users;
		const result = (await submit(adminId, 'grant', nobody.id, {
			productId: seeded.bundle.id,
			reason: 'Workshop attendee'
		})) as FormResult;
		expect(result.form.message).toBe('Product granted.');

		const rows = await db().select().from(entitlements).where(eq(entitlements.user_id, nobody.id));
		expect(rows).toEqual([
			expect.objectContaining({
				product_id: seeded.bundle.id,
				source: 'admin_grant',
				granted_by: adminId,
				revoked_at: null
			})
		]);
		const [entry] = await auditFor('entitlement.grant');
		expect(entry).toMatchObject({ actor_id: adminId, after: { reason: 'Workshop attendee' } });

		// Granting it again is refused on the product field.
		const again = await submit(adminId, 'grant', nobody.id, {
			productId: seeded.bundle.id,
			reason: 'Again'
		});
		expect(failed(again).form.errors.productId).toEqual(['This user already owns that product']);

		const unchosen = await submit(adminId, 'grant', nobody.id, { productId: '', reason: 'x' });
		expect(failed(unchosen).form.errors.productId).toEqual(['Choose a product']);
	});

	it('revokes a product with a reason', async () => {
		const { bundleOwner } = seeded.users;
		const result = (await submit(adminId, 'revoke', bundleOwner.id, {
			productId: seeded.bundle.id,
			reason: 'Chargeback'
		})) as FormResult;
		expect(result.form.message).toBe('Access revoked.');
		expect(await seeded.services.entitlements.ownedProductIds(bundleOwner.id)).toEqual([]);
		expect(await auditFor('entitlement.revoke')).toEqual([
			expect.objectContaining({ actor_id: adminId })
		]);
	});

	it('setAdmin needs the typed phrase, then flips the flag with an audit row', async () => {
		const { nobody } = seeded.users;
		const wrong = await submit(adminId, 'setAdmin', nobody.id, {
			isAdmin: 'true',
			confirm: 'yes'
		});
		expect(failed(wrong).status).toBe(400);
		expect(failed(wrong).form.errors.confirm).toEqual(['Type the phrase exactly to confirm']);
		expect((await profileOf(nobody.id)).is_admin).toBe(false);

		const made = (await submit(adminId, 'setAdmin', nobody.id, {
			isAdmin: 'true',
			confirm: 'Make Admin'
		})) as FormResult;
		expect(made.form.message).toBe('Admin access given.');
		expect((await profileOf(nobody.id)).is_admin).toBe(true);

		const removed = (await submit(adminId, 'setAdmin', nobody.id, {
			isAdmin: 'false',
			confirm: 'remove admin'
		})) as FormResult;
		expect(removed.form.message).toBe('Admin access removed.');
		expect((await profileOf(nobody.id)).is_admin).toBe(false);

		const entries = await auditFor('user.set_admin');
		expect(
			entries
				.map((entry) => entry.after)
				.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
		).toEqual([{ is_admin: false }, { is_admin: true }]);
	});

	it('anonymises a member behind the typed phrase, with the admin as audit actor', async () => {
		const { member } = seeded.users;
		const wrong = await submit(adminId, 'anonymise', member.id, { confirm: 'yes' });
		expect(failed(wrong).form.errors.confirm).toEqual(['Type the phrase exactly to confirm']);
		expect((await profileOf(member.id)).email).toBe(member.email);

		const done = (await submit(adminId, 'anonymise', member.id, {
			confirm: 'Delete this account'
		})) as FormResult;
		expect(done.form.message).toBe('Account anonymised: personal data removed and access ended.');
		expect(await profileOf(member.id)).toMatchObject({
			email: `deleted-${member.id}@invalid.local`,
			full_name: null,
			is_member: false,
			is_suspended: true,
			suspended_reason: 'deleted'
		});
		const active = (
			await db().select().from(entitlements).where(eq(entitlements.user_id, member.id))
		).filter((row) => row.revoked_at === null);
		expect(active).toEqual([]);
		const [entry] = await auditFor('user.anonymise');
		expect(entry).toMatchObject({
			actor_id: adminId,
			entity_id: member.id,
			after: { by: 'admin' }
		});

		// Admins cannot be anonymised from here.
		const refused = await submit(adminId, 'anonymise', adminId, { confirm: 'delete this account' });
		expect(failed(refused).status).toBe(400);
		expect(failed(refused).form.errors._errors).toEqual([
			'An admin account cannot be deleted; remove admin first'
		]);
		expect((await profileOf(adminId)).email).toBe('owner@example.com');
	});

	it('sends a password reset and signs the user out everywhere', async () => {
		const { member } = seeded.users;
		const reset = (await submit(adminId, 'sendReset', member.id)) as FormResult;
		expect(reset.form.message).toBe('Password reset email sent.');
		expect(seeded.services.resetEmails.map((mail) => mail.to)).toEqual([member.email]);

		const signedOut = (await submit(adminId, 'revokeSessions', member.id)) as FormResult;
		expect(signedOut.form.message).toBe('0 sessions signed out.');
		expect(await auditFor('user.revoke_sessions')).toHaveLength(1);
	});

	it('loads the detail and empty forms for an admin; others are turned away', async () => {
		const { bundleOwner, nobody } = seeded.users;
		const event = await memberEvent(seeded.services, adminId, {
			url: `/admin/users/${bundleOwner.id}`,
			params: { id: bundleOwner.id }
		});
		const page = (await load(event as unknown as LoadEvent)) as DetailData;
		expect(page.detail.profile.email).toBe(bundleOwner.email);
		expect(page.detail.entitlements.map((row) => row.productId)).toEqual([seeded.bundle.id]);
		expect(Object.keys(page.forms).sort()).toEqual(
			[
				'anonymise',
				'grant',
				'revoke',
				'revokeSessions',
				'sendReset',
				'setAdmin',
				'suspend',
				'unsuspend'
			].sort()
		);
		expect(page.forms.suspend).toMatchObject({ id: 'suspend', valid: false, errors: {} });

		const unknown = crypto.randomUUID();
		expect(
			await outcome(async () =>
				load(
					(await memberEvent(seeded.services, adminId, {
						url: `/admin/users/${unknown}`,
						params: { id: unknown }
					})) as unknown as LoadEvent
				)
			)
		).toBe('error 404');

		const asNobody = await memberEvent(seeded.services, nobody.id, {
			url: `/admin/users/${bundleOwner.id}`,
			params: { id: bundleOwner.id }
		});
		expect(await outcome(() => load(asNobody as unknown as LoadEvent))).toBe('redirect 303 /');
		const layoutEvent = await memberEvent(seeded.services, null, { url: '/admin' });
		expect(await outcome(() => layoutLoad(layoutEvent as unknown as LayoutEvent))).toBe(
			'redirect 303 /auth/sign-in?redirectTo=%2Fadmin'
		);
	});

	it('searches the user list from the query string', async () => {
		const event = await memberEvent(seeded.services, adminId, {
			url: '/admin/users?q=owner&page=1'
		});
		const page = (await listLoad(event as unknown as ListEvent)) as ListData;
		expect(page.q).toBe('owner');
		expect(page.users.rows.map((row) => row.email).sort()).toEqual([
			'bundle-owner@example.com',
			'owner@example.com'
		]);

		const garbage = await memberEvent(seeded.services, adminId, { url: '/admin/users?page=abc' });
		const all = (await listLoad(garbage as unknown as ListEvent)) as ListData;
		expect(all.users.page).toBe(1);
		expect(all.users.total).toBe(4);
	});
});
