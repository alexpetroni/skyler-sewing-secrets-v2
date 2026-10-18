import { eq } from 'drizzle-orm';
import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import type { AccountExport } from '../../src/lib/server/modules/auth/index.ts';
import { actions, load } from '../../src/routes/(member)/profile/delete/+page.server.ts';
import { GET } from '../../src/routes/(member)/profile/export/+server.ts';
import { useTestDb } from '../helpers/db.ts';
import { FIXTURE_PASSWORD, seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';
import { signInCookie } from '../helpers/services.ts';

// The sveltekitCookies plugin copies Better Auth's cookies onto the current
// request event; the test hands it the fake event of the action under test.
const current = vi.hoisted(() => ({ event: null as unknown }));
vi.mock('$app/server', () => ({ getRequestEvent: () => current.event }));

const { accounts, audit_log, entitlements, orders, order_items, profiles, sessions } = schema;

type ExportEvent = Parameters<typeof GET>[0];
type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<typeof actions.default>[0];
type DeleteData = Exclude<Awaited<ReturnType<typeof load>>, void>;

describe('/profile/export and /profile/delete', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
	});

	/** A paid order with one item for the user, inserted as fulfilment leaves it. */
	async function seedOrder(userId: string): Promise<string> {
		const [order] = await db()
			.insert(orders)
			.values({
				user_id: userId,
				status: 'paid',
				subtotal: 2900,
				total: 2900,
				paid_at: new Date().toISOString()
			})
			.returning({ id: orders.id });
		await db().insert(order_items).values({
			order_id: order.id,
			product_id: seeded.single.id,
			product_title: 'the-single',
			list_price: 2900,
			unit_price: 2900
		});
		return order.id;
	}

	async function exportFor(userId: string | null) {
		const event = await memberEvent(seeded.services, userId, { url: '/profile/export' });
		return outcome(() => GET(event as unknown as ExportEvent));
	}

	async function submitDelete(
		userId: string | null,
		fields: Record<string, string>,
		cookie?: string
	) {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);
		const event = await memberEvent(seeded.services, userId, {
			method: 'POST',
			url: '/profile/delete',
			headers: cookie ? { cookie } : undefined,
			body
		});
		current.event = event;
		return { event, result: await outcome(() => actions.default(event as unknown as ActionEvent)) };
	}

	describe('GET /profile/export', () => {
		it('downloads the profile, orders with items, entitlements and progress as JSON', async () => {
			const { member } = seeded.users;
			const orderId = await seedOrder(member.id);
			await seeded.services.content.progress.upsert({
				userId: member.id,
				lessonId: seeded.lessons.first,
				completed: true
			});

			const response = (await exportFor(member.id)) as Response;
			expect(response.status).toBe(200);
			expect(response.headers.get('content-disposition')).toBe(
				'attachment; filename="skylers-sewing-secrets-account.json"'
			);
			expect(response.headers.get('cache-control')).toBe('no-store');
			const data = (await response.json()) as AccountExport;
			expect(data.profile).toMatchObject({
				id: member.id,
				email: member.email,
				fullName: 'Member'
			});
			expect(data.orders).toEqual([
				expect.objectContaining({
					id: orderId,
					status: 'paid',
					total: 2900,
					items: [
						expect.objectContaining({
							productId: seeded.single.id,
							productTitle: 'the-single',
							unitPrice: 2900
						})
					]
				})
			]);
			expect(data.entitlements).toEqual([
				expect.objectContaining({
					productId: seeded.flagship.id,
					source: 'migration',
					revokedAt: null
				})
			]);
			expect(data.progress).toEqual([
				expect.objectContaining({ lessonId: seeded.lessons.first, completed: true })
			]);
			expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('sends visitors to sign in and refuses suspended accounts', async () => {
			expect(await exportFor(null)).toBe(
				'redirect 303 /auth/sign-in?redirectTo=%2Fprofile%2Fexport'
			);
			const { nobody } = seeded.users;
			await db().update(profiles).set({ is_suspended: true }).where(eq(profiles.id, nobody.id));
			expect(await exportFor(nobody.id)).toBe('error 403');
		});
	});

	describe('/profile/delete', () => {
		it('load says whether a password confirms, and renders the goodbye page without a session', async () => {
			const { member } = seeded.users;
			const event = await memberEvent(seeded.services, member.id, { url: '/profile/delete' });
			expect((await load(event as unknown as LoadEvent)) as DeleteData).toEqual({
				done: false,
				hasPassword: true,
				phrase: 'delete my account'
			});

			await db().delete(accounts).where(eq(accounts.userId, member.id));
			const google = await memberEvent(seeded.services, member.id, { url: '/profile/delete' });
			expect(((await load(google as unknown as LoadEvent)) as DeleteData).hasPassword).toBe(false);

			const done = await memberEvent(seeded.services, null, { url: '/profile/delete?done=1' });
			expect(((await load(done as unknown as LoadEvent)) as DeleteData).done).toBe(true);
			const anonymous = await memberEvent(seeded.services, null, { url: '/profile/delete' });
			expect(await outcome(() => load(anonymous as unknown as LoadEvent))).toBe(
				'redirect 303 /auth/sign-in?redirectTo=%2Fprofile%2Fdelete'
			);
		});

		it('needs the right password, then anonymises, keeps orders, revokes access and ends sign-in', async () => {
			const { member } = seeded.users;
			const orderId = await seedOrder(member.id);
			const cookie = await signInCookie(seeded.services, member.email, FIXTURE_PASSWORD);

			const { result: wrong } = await submitDelete(member.id, { password: 'not-it' }, cookie);
			if (!isActionFailure(wrong)) throw new Error('expected a failure');
			expect(wrong.status).toBe(400);
			expect(wrong.data).toEqual({ error: 'Incorrect password' });
			expect(
				(await db().select().from(sessions).where(eq(sessions.userId, member.id))).length
			).toBe(1);

			const { event, result } = await submitDelete(
				member.id,
				{ password: FIXTURE_PASSWORD },
				cookie
			);
			expect(result).toBe('redirect 303 /profile/delete?done=1');
			// This browser's cookie is cleared and every session row is gone.
			const cleared = event.setCookies.find((c) => c.name === 'better-auth.session_token');
			expect(cleared?.options?.maxAge).toBe(0);
			expect(await db().select().from(sessions).where(eq(sessions.userId, member.id))).toEqual([]);

			const [profile] = await db().select().from(profiles).where(eq(profiles.id, member.id));
			expect(profile).toMatchObject({
				email: `deleted-${member.id}@invalid.local`,
				full_name: null,
				is_member: false,
				is_suspended: true,
				suspended_reason: 'deleted'
			});
			const owned = await db()
				.select()
				.from(entitlements)
				.where(eq(entitlements.user_id, member.id));
			expect(owned).toHaveLength(1);
			expect(owned[0].revoked_at).not.toBeNull();
			expect(owned[0].revoke_reason).toBe('account deleted');
			expect(await seeded.services.entitlements.hasAllAccess(member.id)).toBe(false);
			expect(await db().select().from(orders).where(eq(orders.user_id, member.id))).toEqual([
				expect.objectContaining({ id: orderId, status: 'paid', total: 2900 })
			]);
			expect(
				await db().select().from(order_items).where(eq(order_items.order_id, orderId))
			).toHaveLength(1);

			// Signing in again is impossible: no account row, no password, no email.
			await expect(
				seeded.services.auth.api.signInEmail({
					body: { email: member.email, password: FIXTURE_PASSWORD }
				})
			).rejects.toThrow();
			expect(await seeded.services.users.findUserIdByEmail(member.email)).toBeNull();

			const [entry] = await db()
				.select()
				.from(audit_log)
				.where(eq(audit_log.action, 'user.anonymise'));
			expect(entry).toMatchObject({
				actor_id: member.id,
				entity_id: member.id,
				after: { by: 'self', entitlements_revoked: 1 }
			});
		});

		it('asks a Google-only account for the typed phrase instead', async () => {
			const { bundleOwner } = seeded.users;
			await db().delete(accounts).where(eq(accounts.userId, bundleOwner.id));

			const { result: wrong } = await submitDelete(bundleOwner.id, { confirm: 'delete' });
			if (!isActionFailure(wrong)) throw new Error('expected a failure');
			expect(wrong.data).toEqual({ error: 'Type the phrase exactly to confirm' });

			const { result } = await submitDelete(bundleOwner.id, { confirm: 'Delete My Account' });
			expect(result).toBe('redirect 303 /profile/delete?done=1');
			const [profile] = await db().select().from(profiles).where(eq(profiles.id, bundleOwner.id));
			expect(profile.suspended_reason).toBe('deleted');
		});

		it('refuses visitors', async () => {
			const { result } = await submitDelete(null, { password: FIXTURE_PASSWORD });
			expect(result).toBe('redirect 303 /auth/sign-in?redirectTo=%2Fprofile%2Fdelete');
		});
	});
});
