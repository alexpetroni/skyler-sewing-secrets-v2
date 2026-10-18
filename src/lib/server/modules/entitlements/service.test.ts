import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../../../../tests/helpers/db.ts';
import { createTestServices } from '../../../../../tests/helpers/services.ts';
import { schema, withTx } from '#lib/server/db/index.ts';
import type { ProductInput } from '#lib/shared/schemas/catalog.ts';
import { DomainError } from '../errors.ts';
import { canAccessLesson, lockState, type AccessContext } from './service.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { audit_log, entitlements, media_assets, orders, order_items, profiles } = schema;

let slugSequence = 0;
function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
	slugSequence += 1;
	return {
		kind: 'bundle',
		slug: `product-${slugSequence}`,
		title: 'Zippers Pack',
		tagline: '',
		descriptionMd: 'Every zipper technique',
		coverImageUrl: 'https://cdn.example.com/zippers.jpg',
		price: 2900,
		salePrice: null,
		saleStartsAt: null,
		saleEndsAt: null,
		isFeatured: false,
		sortOrder: 0,
		...overrides
	};
}

describe('createEntitlementService', () => {
	const { db } = useTestDb();
	const setup = () => createTestServices(db());

	let sequence = 0;
	async function createLesson(): Promise<string> {
		sequence += 1;
		const [asset] = await db()
			.insert(media_assets)
			.values({ library_id: '100', video_id: `video-${sequence}`, status: 'ready' })
			.returning();
		const lesson = await setup().content.lessons.create({
			moduleId: null,
			title: `Lesson ${sequence}`,
			slug: `lesson-${sequence}`,
			kind: 'video',
			mediaAssetId: asset.id,
			description: '',
			contentMd: '',
			isFreePreview: false,
			isPublished: true,
			orderIndex: sequence
		});
		return lesson.id;
	}

	async function createUser(email: string): Promise<string> {
		return setup().users.createCredentialUser({ email, password: 'member-password' });
	}

	async function isMember(userId: string): Promise<boolean> {
		const [row] = await db()
			.select({ is_member: profiles.is_member })
			.from(profiles)
			.where(eq(profiles.id, userId));
		return row.is_member;
	}

	async function createFlagship(): Promise<string> {
		const { catalog } = setup();
		return (await catalog.create(productInput({ kind: 'course', price: 14900 }))).id;
	}

	async function createBundle(lessonIds: string[]): Promise<string> {
		const { catalog } = setup();
		const bundle = await catalog.create(productInput({ kind: 'bundle' }));
		await catalog.setItems(bundle.id, lessonIds);
		return bundle.id;
	}

	describe('grant and revoke', () => {
		it('grant is idempotent: the active entitlement is returned unchanged', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const bundleId = await createBundle([await createLesson(), await createLesson()]);

			const first = await svc.grant({ userId, productId: bundleId, source: 'admin_grant' });
			const again = await svc.grant({ userId, productId: bundleId, source: 'purchase' });

			expect(again).toEqual(first);
			expect(first).toMatchObject({ source: 'admin_grant', revoked_at: null, granted_by: null });
			expect(await db().select().from(entitlements)).toHaveLength(1);
			expect(await svc.ownedProductIds(userId)).toEqual([bundleId]);
		});

		it('refuses a product that does not exist', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const err = await svc.grant({ userId, productId: crypto.randomUUID(), source: 'gift' }).then(
				() => null,
				(e: unknown) => e
			);
			expect(err).toBeInstanceOf(DomainError);
			expect((err as DomainError).code).toBe('PRODUCT_NOT_FOUND');
		});

		it('revoke sets revoked_at and the reason; grant afterwards creates a second row', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const bundleId = await createBundle([await createLesson()]);

			const first = await svc.grant({ userId, productId: bundleId, source: 'purchase' });
			const revoked = await svc.revoke({ userId, productId: bundleId, reason: 'refund' });
			expect(revoked?.id).toBe(first.id);
			expect(revoked?.revoked_at).not.toBeNull();
			expect(revoked?.revoke_reason).toBe('refund');
			expect(await svc.ownedProductIds(userId)).toEqual([]);
			// Nothing active to revoke now.
			expect(await svc.revoke({ userId, productId: bundleId, reason: 'again' })).toBeNull();

			const second = await svc.grant({ userId, productId: bundleId, source: 'admin_grant' });
			expect(second.id).not.toBe(first.id);

			const rows = await db().select().from(entitlements);
			expect(rows).toHaveLength(2);
			expect(rows.filter((row) => row.revoked_at === null).map((row) => row.id)).toEqual([
				second.id
			]);
		});

		it('the partial unique index allows one active entitlement per user and product', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const bundleId = await createBundle([await createLesson()]);
			await svc.grant({ userId, productId: bundleId, source: 'purchase' });

			const err = await db()
				.insert(entitlements)
				.values({ user_id: userId, product_id: bundleId, source: 'gift' })
				.then(
					() => null,
					(e: unknown) => e
				);
			expect(err).toBeInstanceOf(Error);
			// Drizzle wraps the driver error; the index name is in the cause.
			expect(String((err as Error).cause)).toMatch(/idx_entitlements_active/);

			await svc.revoke({ userId, productId: bundleId, reason: 'refund' });
			await expect(
				db().insert(entitlements).values({ user_id: userId, product_id: bundleId, source: 'gift' })
			).resolves.toBeDefined();
		});

		it('records granted_by and audit entries when an actor is given, nothing otherwise', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const adminId = await createUser('admin@example.com');
			const bundleId = await createBundle([await createLesson()]);

			const granted = await svc.grant({
				userId,
				productId: bundleId,
				source: 'admin_grant',
				actorId: adminId
			});
			expect(granted.granted_by).toBe(adminId);
			await svc.revoke({ userId, productId: bundleId, reason: 'mistake', actorId: adminId });

			const entries = await db().select().from(audit_log).orderBy(audit_log.created_at);
			expect(entries.map((entry) => [entry.action, entry.actor_id, entry.entity_id])).toEqual([
				['entitlement.grant', adminId, granted.id],
				['entitlement.revoke', adminId, granted.id]
			]);
			expect(entries[1].after).toMatchObject({ revoke_reason: 'mistake' });

			await svc.grant({ userId, productId: bundleId, source: 'purchase' });
			await svc.revoke({ userId, productId: bundleId, reason: 'refund' });
			expect(await db().select().from(audit_log)).toHaveLength(2);
		});

		it('joins an outer transaction: a rolled-back grant leaves no row and no is_member flip', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const flagshipId = await createFlagship();

			await expect(
				withTx(db(), async (tx) => {
					await svc.grant({ userId, productId: flagshipId, source: 'purchase', tx });
					throw new Error('abort');
				})
			).rejects.toThrow('abort');

			expect(await db().select().from(entitlements)).toEqual([]);
			expect(await isMember(userId)).toBe(false);
		});

		it('revokeByOrderItems revokes the items’ entitlements and resyncs each owner', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const flagshipId = await createFlagship();
			const bundleId = await createBundle([await createLesson()]);
			const [order] = await db()
				.insert(orders)
				.values({ user_id: userId, status: 'paid', subtotal: 17800, total: 17800 })
				.returning();
			const [courseItem, bundleItem] = await db()
				.insert(order_items)
				.values([
					{
						order_id: order.id,
						product_id: flagshipId,
						product_title: 'Course',
						list_price: 14900,
						unit_price: 14900
					},
					{
						order_id: order.id,
						product_id: bundleId,
						product_title: 'Bundle',
						list_price: 2900,
						unit_price: 2900
					}
				])
				.returning();
			await svc.grant({
				userId,
				productId: flagshipId,
				source: 'purchase',
				orderItemId: courseItem.id
			});
			await svc.grant({
				userId,
				productId: bundleId,
				source: 'purchase',
				orderItemId: bundleItem.id
			});
			expect(await isMember(userId)).toBe(true);

			expect(await svc.revokeByOrderItems([], 'noop')).toEqual([]);
			const revoked = await svc.revokeByOrderItems(
				[courseItem.id, bundleItem.id],
				'charge.refunded'
			);
			expect(revoked.map((row) => row.product_id).sort()).toEqual([flagshipId, bundleId].sort());
			expect(revoked.every((row) => row.revoke_reason === 'charge.refunded')).toBe(true);
			expect(await svc.ownedProductIds(userId)).toEqual([]);
			expect(await isMember(userId)).toBe(false);
			// Already revoked: nothing more to do.
			expect(await svc.revokeByOrderItems([courseItem.id], 'again')).toEqual([]);
		});
	});

	describe('is_member sync', () => {
		it('flips true on a flagship grant and false on its revoke', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const flagshipId = await createFlagship();
			expect(await isMember(userId)).toBe(false);

			await svc.grant({ userId, productId: flagshipId, source: 'migration' });
			expect(await isMember(userId)).toBe(true);
			expect(await svc.hasAllAccess(userId)).toBe(true);

			await svc.revoke({ userId, productId: flagshipId, reason: 'refund' });
			expect(await isMember(userId)).toBe(false);
			expect(await svc.hasAllAccess(userId)).toBe(false);
		});

		it('is unaffected by bundle grants and revokes', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const bundleId = await createBundle([await createLesson()]);

			await svc.grant({ userId, productId: bundleId, source: 'purchase' });
			expect(await isMember(userId)).toBe(false);
			expect(await svc.hasAllAccess(userId)).toBe(false);

			// A legacy flag out of step with the entitlements is corrected by syncIsMember.
			await db().update(profiles).set({ is_member: true }).where(eq(profiles.id, userId));
			await svc.revoke({ userId, productId: bundleId, reason: 'refund' });
			expect(await isMember(userId)).toBe(false);
			expect(await svc.syncIsMember(userId)).toBe(false);
		});
	});

	describe('reads', () => {
		it('listForUser returns active entitlements with their product, newest first', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const flagshipId = await createFlagship();
			const bundleId = await createBundle([await createLesson()]);
			const revokedId = await createBundle([await createLesson()]);

			await svc.grant({ userId, productId: revokedId, source: 'gift' });
			await svc.revoke({ userId, productId: revokedId, reason: 'refund' });
			await db()
				.update(entitlements)
				.set({ granted_at: '2026-01-01T00:00:00Z' })
				.where(eq(entitlements.product_id, revokedId));
			const bundle = await svc.grant({ userId, productId: bundleId, source: 'purchase' });
			await db()
				.update(entitlements)
				.set({ granted_at: '2026-02-01T00:00:00Z' })
				.where(eq(entitlements.id, bundle.id));
			const course = await svc.grant({ userId, productId: flagshipId, source: 'purchase' });
			await db()
				.update(entitlements)
				.set({ granted_at: '2026-03-01T00:00:00Z' })
				.where(eq(entitlements.id, course.id));

			const owned = await svc.listForUser(userId);
			expect(owned.map((row) => row.product_id)).toEqual([flagshipId, bundleId]);
			expect(owned[0].product).toEqual({
				title: 'Zippers Pack',
				kind: 'course',
				slug: owned[0].product.slug
			});
			expect(owned[1].product.kind).toBe('bundle');
			expect((await svc.ownedProductIds(userId)).sort()).toEqual([flagshipId, bundleId].sort());
		});

		it('accessibleLessonIds: all-access owns every lesson, including one created after the grant', async () => {
			const { entitlements: svc } = setup();
			const userId = await createUser('member@example.com');
			const flagshipId = await createFlagship();
			const before = await createLesson();
			await createBundle([before]);

			await svc.grant({ userId, productId: flagshipId, source: 'migration' });
			const after = await createLesson();

			expect(await svc.accessibleLessonIds(userId)).toEqual(new Set([before, after]));
		});

		it('accessibleLessonIds: a bundle owner gets the bundle’s lessons only; nobody gets none', async () => {
			const { entitlements: svc } = setup();
			const owner = await createUser('owner@example.com');
			const nobody = await createUser('nobody@example.com');
			const [a, b, c] = [await createLesson(), await createLesson(), await createLesson()];
			const bundleId = await createBundle([a, b]);
			await createBundle([c]);
			await createFlagship();

			await svc.grant({ userId: owner, productId: bundleId, source: 'purchase' });
			expect(await svc.accessibleLessonIds(owner)).toEqual(new Set([a, b]));
			expect(await svc.accessibleLessonIds(nobody)).toEqual(new Set());

			await svc.revoke({ userId: owner, productId: bundleId, reason: 'refund' });
			expect(await svc.accessibleLessonIds(owner)).toEqual(new Set());
		});
	});
});

describe('canAccessLesson and lockState (pure)', () => {
	const lessonId = 'lesson-1';
	const locked = { id: lessonId, isFreePreview: false };
	const preview = { id: lessonId, isFreePreview: true };

	function ctx(overrides: Partial<AccessContext> = {}): AccessContext {
		return {
			profile: { is_suspended: false },
			accessibleLessonIds: new Set<string>(),
			isAdmin: false,
			...overrides
		};
	}

	const anonymous = ctx({ profile: null });
	const suspendedOwner = ctx({
		profile: { is_suspended: true },
		accessibleLessonIds: new Set([lessonId])
	});
	const adminWithoutEntitlement = ctx({ isAdmin: true });
	const owner = ctx({ accessibleLessonIds: new Set([lessonId]) });
	const nonOwner = ctx({ accessibleLessonIds: new Set(['lesson-2']) });

	it.each([
		['free preview, anonymous', anonymous, preview, true, 'open'],
		['suspended owner', suspendedOwner, locked, false, 'suspended'],
		['admin without entitlement', adminWithoutEntitlement, locked, true, 'open'],
		['owner', owner, locked, true, 'open'],
		['non-owner', nonOwner, locked, false, 'locked']
	] as const)('%s', (_name, context, lesson, allowed, state) => {
		expect(canAccessLesson(context, lesson)).toBe(allowed);
		expect(lockState(context, lesson)).toBe(state);
	});

	it('anonymous visitors are locked out of non-preview lessons', () => {
		expect(canAccessLesson(anonymous, locked)).toBe(false);
		expect(lockState(anonymous, locked)).toBe('locked');
	});

	it('a free preview stays open to a suspended account', () => {
		expect(canAccessLesson(suspendedOwner, preview)).toBe(true);
		expect(lockState(suspendedOwner, preview)).toBe('open');
	});
});
