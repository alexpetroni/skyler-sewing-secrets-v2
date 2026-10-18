import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { schema, withTx, type Db, type Tx } from '#lib/server/db/index.ts';
import type { Logger } from '#lib/server/platform/index.ts';
import {
	PROMO_CODE_PATTERN,
	type BulkGenerateInput,
	type PromoInput
} from '#lib/shared/schemas/commerce.ts';
import { DomainError } from '../errors.ts';
import { checkEligibility, type PromoRejection, type PromoRule } from './pricing.ts';

const { promo_codes, promo_code_products, promo_redemptions, orders, profiles, audit_log } = schema;

export type PromoCode = typeof promo_codes.$inferSelect;
export type PromoRedemption = typeof promo_redemptions.$inferSelect;

/** A code as the admin list and detail show it. */
export interface PromoCodeSummary extends PromoCode {
	productIds: string[];
	/** Redemptions on orders that did not expire. */
	redemptionCount: number;
}

/** One row of the admin redemption table. */
export interface RedemptionRow {
	id: string;
	orderId: string;
	orderStatus: (typeof orders.$inferSelect)['status'];
	userId: string;
	userEmail: string;
	discountTotal: number;
	createdAt: string;
}

/** What `findValidByCode` needs to know about each cart line. */
export interface PromoLine {
	productId: string;
	effectivePrice: number;
	onSale: boolean;
}

export interface FindValidParams {
	/** The signed-in buyer, for the per-user cap; absent before the account step. */
	userId?: string;
	lines: readonly PromoLine[];
	now?: Date;
}

export type FindValidResult = { ok: true; rule: PromoRule } | { ok: false; reason: PromoRejection };

export interface ReserveRedemptionInput {
	promoCodeId: string;
	orderId: string;
	userId: string;
	discountTotal: number;
	now?: Date;
}

/** Thrown by `reserveRedemption` when the cap was reached since the code was applied. */
export class PromoRejectedError extends DomainError {
	readonly reason: PromoRejection;
	constructor(reason: PromoRejection) {
		super('PROMO_REJECTED', `Promo code rejected: ${reason}`);
		this.name = 'PromoRejectedError';
		this.reason = reason;
	}
}

export interface PromoService {
	/** Trim, upper-case, pattern-check; null when the input can never be a code. */
	normalizeCode(input: string): string | null;
	/**
	 * The single validity predicate (docs/analysis/05-discounts.md): active,
	 * inside its window, under both caps, with an eligible line that reaches
	 * the minimum. Evaluated when a code is applied and again at checkout.
	 */
	findValidByCode(code: string, params: FindValidParams, tx?: Tx): Promise<FindValidResult>;
	/**
	 * Inside the checkout transaction: locks the code row, recounts under the
	 * lock and inserts the redemption, or throws `PromoRejectedError`
	 * (`cap_reached` / `user_cap_reached`).
	 */
	reserveRedemption(tx: Tx, input: ReserveRedemptionInput): Promise<PromoRedemption>;
	/** Deletes the order's redemption (order expired unpaid); false when there was none. */
	releaseRedemption(tx: Tx, orderId: string): Promise<boolean>;
	/** Every code, newest first. */
	list(): Promise<PromoCodeSummary[]>;
	getById(id: string): Promise<PromoCodeSummary | null>;
	create(input: PromoInput, actorId?: string): Promise<PromoCodeSummary>;
	/** `code` may change while no redemption exists; otherwise it is kept. */
	update(id: string, input: PromoInput, actorId?: string): Promise<PromoCodeSummary>;
	setProducts(id: string, productIds: string[], actorId?: string): Promise<string[]>;
	setActive(id: string, active: boolean, actorId?: string): Promise<PromoCode>;
	/** `count` single-use codes `PREFIX-XXXXXX` sharing the given terms. */
	bulkGenerate(input: BulkGenerateInput, actorId?: string): Promise<PromoCode[]>;
	listRedemptions(codeId: string): Promise<RedemptionRow[]>;
}

export interface CreatePromoServiceDeps {
	db: Db;
	log: Logger;
}

/** Unambiguous upper-case alphabet for generated codes (no 0/O, 1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LENGTH = 6;

export function normalizeCode(input: string): string | null {
	const code = input.trim().toUpperCase();
	return PROMO_CODE_PATTERN.test(code) ? code : null;
}

function randomSuffix(): string {
	const bytes = randomBytes(CODE_SUFFIX_LENGTH);
	let out = '';
	for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
	return out;
}

function toRule(row: PromoCode, productIds: readonly string[]): PromoRule {
	return {
		id: row.id,
		code: row.code,
		discountType: row.discount_type,
		discountValue: row.discount_value,
		appliesTo: row.applies_to,
		productIds,
		minSubtotal: row.min_subtotal,
		stackableWithSale: row.stackable_with_sale
	};
}

/** The columns an admin form writes, with the legacy mirrors the old app still reads. */
function promoValues(input: Omit<PromoInput, 'code' | 'maxRedemptions' | 'maxRedemptionsPerUser'>) {
	return {
		description: input.description || null,
		discount_type: input.discountType,
		discount_value: input.discountValue,
		applies_to: input.appliesTo,
		min_subtotal: input.minSubtotal,
		starts_at: input.startsAt,
		ends_at: input.endsAt,
		is_active: input.isActive,
		stackable_with_sale: input.stackableWithSale,
		valid_until: input.endsAt,
		min_purchase_amount: input.minSubtotal,
		...(input.startsAt ? { valid_from: input.startsAt } : {})
	};
}

export function createPromoService({ db, log }: CreatePromoServiceDeps): PromoService {
	async function audit(
		tx: Tx,
		actorId: string | undefined,
		action: string,
		entityId: string | null,
		before: unknown,
		after: unknown
	): Promise<void> {
		if (!actorId) return;
		await tx.insert(audit_log).values({
			actor_id: actorId,
			action,
			entity: 'promo_code',
			entity_id: entityId,
			before,
			after
		});
	}

	async function requireCode(executor: Db | Tx, id: string): Promise<PromoCode> {
		const [row] = await executor.select().from(promo_codes).where(eq(promo_codes.id, id)).limit(1);
		if (!row) throw new DomainError('PROMO_NOT_FOUND', 'Promo code not found');
		return row;
	}

	async function assertCodeFree(executor: Db | Tx, code: string, exceptId?: string): Promise<void> {
		const [clash] = await executor
			.select({ id: promo_codes.id })
			.from(promo_codes)
			.where(eq(promo_codes.code, code))
			.limit(1);
		if (clash && clash.id !== exceptId) {
			throw new DomainError('PROMO_CODE_TAKEN', 'A code with that name already exists');
		}
	}

	async function productIdsOf(executor: Db | Tx, codeId: string): Promise<string[]> {
		const rows = await executor
			.select({ productId: promo_code_products.product_id })
			.from(promo_code_products)
			.where(eq(promo_code_products.promo_code_id, codeId));
		return rows.map((row) => row.productId);
	}

	/**
	 * Redemptions on orders that are not `expired` (pending ones hold their
	 * place until the expiry job releases them), in total and for one user.
	 */
	async function countRedemptions(
		executor: Db | Tx,
		codeId: string,
		userId: string | undefined
	): Promise<{ total: number; byUser: number }> {
		const [row] = await executor
			.select({
				total: sql<number>`count(*)`.mapWith(Number),
				byUser: userId
					? sql<number>`count(*) filter (where ${promo_redemptions.user_id} = ${userId})`.mapWith(
							Number
						)
					: sql<number>`0`.mapWith(Number)
			})
			.from(promo_redemptions)
			.innerJoin(orders, eq(orders.id, promo_redemptions.order_id))
			.where(and(eq(promo_redemptions.promo_code_id, codeId), ne(orders.status, 'expired')));
		return { total: row?.total ?? 0, byUser: row?.byUser ?? 0 };
	}

	function capReached(
		row: Pick<PromoCode, 'max_redemptions' | 'max_redemptions_per_user'>,
		counts: { total: number; byUser: number },
		userId: string | undefined
	): Extract<PromoRejection, 'cap_reached' | 'user_cap_reached'> | null {
		if (row.max_redemptions !== null && counts.total >= row.max_redemptions) return 'cap_reached';
		if (
			userId !== undefined &&
			row.max_redemptions_per_user !== null &&
			counts.byUser >= row.max_redemptions_per_user
		) {
			return 'user_cap_reached';
		}
		return null;
	}

	async function replaceProducts(tx: Tx, codeId: string, productIds: string[]): Promise<string[]> {
		const unique = [...new Set(productIds)];
		await tx.delete(promo_code_products).where(eq(promo_code_products.promo_code_id, codeId));
		if (unique.length > 0) {
			await tx
				.insert(promo_code_products)
				.values(unique.map((productId) => ({ promo_code_id: codeId, product_id: productId })));
		}
		return unique;
	}

	async function summarise(executor: Db | Tx, row: PromoCode): Promise<PromoCodeSummary> {
		const [productIds, counts] = [
			await productIdsOf(executor, row.id),
			await countRedemptions(executor, row.id, undefined)
		];
		return { ...row, productIds, redemptionCount: counts.total };
	}

	return {
		normalizeCode,

		async findValidByCode(input, { userId, lines, now = new Date() }, tx) {
			const executor = tx ?? db;
			const code = normalizeCode(input);
			if (!code) return { ok: false, reason: 'not_found' };
			const [row] = await executor
				.select()
				.from(promo_codes)
				.where(eq(promo_codes.code, code))
				.limit(1);
			if (!row) return { ok: false, reason: 'not_found' };
			if (!row.is_active) return { ok: false, reason: 'inactive' };
			const time = now.getTime();
			if (row.starts_at !== null && Date.parse(row.starts_at) > time) {
				return { ok: false, reason: 'not_started' };
			}
			if (row.ends_at !== null && Date.parse(row.ends_at) <= time) {
				return { ok: false, reason: 'expired' };
			}
			const cap = capReached(row, await countRedemptions(executor, row.id, userId), userId);
			if (cap) return { ok: false, reason: cap };
			const rule = toRule(row, await productIdsOf(executor, row.id));
			const eligibility = checkEligibility(lines, rule);
			if (eligibility) return { ok: false, reason: eligibility };
			return { ok: true, rule };
		},

		async reserveRedemption(tx, { promoCodeId, orderId, userId, discountTotal, now = new Date() }) {
			// Serialises concurrent checkouts on the same code: the recount below
			// sees every committed redemption and no other reservation can slip in.
			const [row] = await tx
				.select()
				.from(promo_codes)
				.where(eq(promo_codes.id, promoCodeId))
				.for('update');
			if (!row) throw new DomainError('PROMO_NOT_FOUND', 'Promo code not found');
			const cap = capReached(row, await countRedemptions(tx, row.id, userId), userId);
			if (cap) {
				log.info('promo reservation refused', { promoCodeId, orderId, reason: cap });
				throw new PromoRejectedError(cap);
			}
			const [redemption] = await tx
				.insert(promo_redemptions)
				.values({
					promo_code_id: promoCodeId,
					order_id: orderId,
					user_id: userId,
					discount_total: discountTotal,
					created_at: now.toISOString()
				})
				.returning();
			log.info('promo reserved', { promoCodeId, orderId });
			return redemption;
		},

		async releaseRedemption(tx, orderId) {
			const deleted = await tx
				.delete(promo_redemptions)
				.where(eq(promo_redemptions.order_id, orderId))
				.returning({ id: promo_redemptions.id });
			if (deleted.length > 0) log.info('promo released', { orderId });
			return deleted.length > 0;
		},

		async list() {
			const rows = await db.select().from(promo_codes).orderBy(desc(promo_codes.created_at));
			if (rows.length === 0) return [];
			const ids = rows.map((row) => row.id);
			const scope = await db
				.select()
				.from(promo_code_products)
				.where(inArray(promo_code_products.promo_code_id, ids));
			const counts = await db
				.select({
					codeId: promo_redemptions.promo_code_id,
					total: sql<number>`count(*)`.mapWith(Number)
				})
				.from(promo_redemptions)
				.innerJoin(orders, eq(orders.id, promo_redemptions.order_id))
				.where(and(inArray(promo_redemptions.promo_code_id, ids), ne(orders.status, 'expired')))
				.groupBy(promo_redemptions.promo_code_id);
			const countByCode = new Map(counts.map((row) => [row.codeId, row.total]));
			return rows.map((row) => ({
				...row,
				productIds: scope
					.filter((link) => link.promo_code_id === row.id)
					.map((link) => link.product_id),
				redemptionCount: countByCode.get(row.id) ?? 0
			}));
		},

		async getById(id) {
			const [row] = await db.select().from(promo_codes).where(eq(promo_codes.id, id)).limit(1);
			return row ? summarise(db, row) : null;
		},

		create: (input, actorId) =>
			withTx(db, async (tx) => {
				await assertCodeFree(tx, input.code);
				const [row] = await tx
					.insert(promo_codes)
					.values({
						code: input.code,
						...promoValues(input),
						max_redemptions: input.maxRedemptions,
						max_redemptions_per_user: input.maxRedemptionsPerUser,
						max_uses: input.maxRedemptions,
						created_by: actorId ?? null
					})
					.returning();
				const productIds =
					input.appliesTo === 'products' ? await replaceProducts(tx, row.id, input.productIds) : [];
				await audit(tx, actorId, 'promo.create', row.id, null, { ...row, productIds });
				log.info('promo code created', { promoCodeId: row.id });
				return { ...row, productIds, redemptionCount: 0 };
			}),

		update: (id, input, actorId) =>
			withTx(db, async (tx) => {
				const before = await summarise(tx, await requireCode(tx, id));
				const code = before.redemptionCount > 0 ? before.code : input.code;
				if (code !== before.code) await assertCodeFree(tx, code, id);
				const [row] = await tx
					.update(promo_codes)
					.set({
						code,
						...promoValues(input),
						max_redemptions: input.maxRedemptions,
						max_redemptions_per_user: input.maxRedemptionsPerUser,
						max_uses: input.maxRedemptions,
						updated_at: new Date().toISOString()
					})
					.where(eq(promo_codes.id, id))
					.returning();
				const productIds = await replaceProducts(
					tx,
					id,
					input.appliesTo === 'products' ? input.productIds : []
				);
				const after = { ...row, productIds, redemptionCount: before.redemptionCount };
				await audit(tx, actorId, 'promo.update', id, before, after);
				log.info('promo code updated', { promoCodeId: id });
				return after;
			}),

		setProducts: (id, productIds, actorId) =>
			withTx(db, async (tx) => {
				await requireCode(tx, id);
				const before = await productIdsOf(tx, id);
				const after = await replaceProducts(tx, id, productIds);
				await audit(
					tx,
					actorId,
					'promo.set_products',
					id,
					{ productIds: before },
					{ productIds: after }
				);
				return after;
			}),

		setActive: (id, active, actorId) =>
			withTx(db, async (tx) => {
				const before = await requireCode(tx, id);
				const [after] = await tx
					.update(promo_codes)
					.set({ is_active: active, updated_at: new Date().toISOString() })
					.where(eq(promo_codes.id, id))
					.returning();
				await audit(tx, actorId, active ? 'promo.activate' : 'promo.deactivate', id, before, after);
				log.info(active ? 'promo code activated' : 'promo code deactivated', { promoCodeId: id });
				return after;
			}),

		bulkGenerate: ({ prefix, count, ...terms }, actorId) =>
			withTx(db, async (tx) => {
				const taken = new Set(
					(
						await tx
							.select({ code: promo_codes.code })
							.from(promo_codes)
							.where(sql`${promo_codes.code} like ${`${prefix}-%`}`)
					).map((row) => row.code)
				);
				const codes: string[] = [];
				while (codes.length < count) {
					const code = `${prefix}-${randomSuffix()}`;
					if (taken.has(code)) continue;
					taken.add(code);
					codes.push(code);
				}
				const rows = await tx
					.insert(promo_codes)
					.values(
						codes.map((code) => ({
							code,
							...promoValues(terms),
							max_redemptions: 1,
							max_redemptions_per_user: 1,
							max_uses: 1,
							created_by: actorId ?? null
						}))
					)
					.returning();
				if (terms.appliesTo === 'products') {
					for (const row of rows) await replaceProducts(tx, row.id, terms.productIds);
				}
				await audit(tx, actorId, 'promo.bulk_generate', null, null, {
					prefix,
					count,
					ids: rows.map((row) => row.id)
				});
				log.info('promo codes generated', { count: rows.length });
				return rows;
			}),

		async listRedemptions(codeId) {
			const rows = await db
				.select({
					id: promo_redemptions.id,
					orderId: promo_redemptions.order_id,
					orderStatus: orders.status,
					userId: promo_redemptions.user_id,
					userEmail: profiles.email,
					discountTotal: promo_redemptions.discount_total,
					createdAt: promo_redemptions.created_at
				})
				.from(promo_redemptions)
				.innerJoin(orders, eq(orders.id, promo_redemptions.order_id))
				.innerJoin(profiles, eq(profiles.id, promo_redemptions.user_id))
				.where(eq(promo_redemptions.promo_code_id, codeId))
				.orderBy(asc(promo_redemptions.created_at));
			return rows;
		}
	};
}
