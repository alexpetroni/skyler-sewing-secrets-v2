import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../src/lib/server/db/index.ts';
import type { PromoInput } from '../../src/lib/shared/schemas/commerce.ts';
import { load as listLoad } from '../../src/routes/admin/promotions/+page.server.ts';
import { actions as bulkActions } from '../../src/routes/admin/promotions/bulk/+page.server.ts';
import { actions as newActions } from '../../src/routes/admin/promotions/new/+page.server.ts';
import {
	actions as editActions,
	load as editLoad
} from '../../src/routes/admin/promotions/[id]/+page.server.ts';
import { GET as exportCsv } from '../../src/routes/admin/promotions/[id]/redemptions.csv/+server.ts';
import { auditActions, createAdmin, failed, runLoad, submitAction } from '../helpers/admin.ts';
import { useTestDb } from '../helpers/db.ts';
import { seedCatalog, type SeededCatalog } from '../helpers/fixtures.ts';
import { memberEvent, outcome } from '../helpers/member.ts';

vi.mock('$app/server', () => ({ getRequestEvent: () => null }));

const { orders, promo_codes, promo_redemptions } = schema;

type ListData = import('../../src/routes/admin/promotions/$types').PageServerData;
type EditData = import('../../src/routes/admin/promotions/[id]/$types').PageServerData;
type ExportEvent = Parameters<typeof exportCsv>[0];

interface FormResult {
	valid: boolean;
	errors: Record<string, unknown> & { _errors?: string[] };
}

const baseFields: Array<[string, string]> = [
	['code', 'spring20'],
	['discountType', 'percentage'],
	['discountValue', '20'],
	['appliesTo', 'all'],
	['maxRedemptions', ''],
	['maxRedemptionsPerUser', ''],
	['minSubtotal', ''],
	['startsAt', ''],
	['endsAt', ''],
	['description', 'Spring sale'],
	['isActive', 'on']
];

/** `baseFields` with some names replaced and extra (repeatable) entries appended. */
function fields(
	overrides: Record<string, string> = {},
	extra: Array<[string, string]> = []
): Array<[string, string]> {
	return [
		...baseFields.map(([name, value]): [string, string] => [name, overrides[name] ?? value]),
		...extra
	];
}

/** The error list superforms reports for a field, plain or (for arrays) under `_errors`. */
function fieldErrors(form: FormResult, name: string): string[] | undefined {
	const value = form.errors[name];
	return Array.isArray(value) ? value : (value as { _errors?: string[] } | undefined)?._errors;
}

function promoInput(overrides: Partial<PromoInput> = {}): PromoInput {
	return {
		code: 'BASE10',
		description: '',
		discountType: 'percentage',
		discountValue: 10,
		appliesTo: 'all',
		productIds: [],
		minSubtotal: null,
		maxRedemptions: null,
		maxRedemptionsPerUser: null,
		startsAt: null,
		endsAt: null,
		isActive: true,
		stackableWithSale: false,
		...overrides
	};
}

describe('/admin/promotions', () => {
	const { db } = useTestDb();
	let seeded: SeededCatalog;
	let adminId: string;

	beforeEach(async () => {
		seeded = await seedCatalog(db());
		adminId = await createAdmin(seeded.services);
	});

	/** Posts form fields (names may repeat) to an action as `userId`. */
	async function post<E>(
		userId: string | null,
		action: (event: E) => unknown,
		url: string,
		entries: Array<[string, string]>,
		params: Record<string, string> = {}
	) {
		const body = new FormData();
		for (const [name, value] of entries) body.append(name, value);
		const event = await memberEvent(seeded.services, userId, { method: 'POST', url, body, params });
		return outcome(() => action(event as unknown as E));
	}

	/** A paid order by `userId` that redeemed `codeId`. */
	async function redeem(codeId: string, userId: string, discountTotal = 290) {
		const [order] = await db()
			.insert(orders)
			.values({ user_id: userId, status: 'paid', subtotal: 2900, total: 2900 - discountTotal })
			.returning();
		await db().insert(promo_redemptions).values({
			promo_code_id: codeId,
			order_id: order.id,
			user_id: userId,
			discount_total: discountTotal,
			created_at: '2026-10-01T10:00:00.000Z'
		});
		return order.id;
	}

	describe('create', () => {
		it('creates a code scoped to two products and opens it', async () => {
			const result = String(
				await post(
					adminId,
					newActions.create,
					'/admin/promotions/new?/create',
					fields({ appliesTo: 'products', maxRedemptions: '50', endsAt: '2026-12-31T23:59' }, [
						['productIds', seeded.bundle.id],
						['productIds', seeded.single.id]
					])
				)
			);
			expect(result).toMatch(/^redirect 303 \/admin\/promotions\/[0-9a-f-]{36}$/);
			const id = result.split('/').pop() ?? '';
			const code = await seeded.services.commerce.promo.getById(id);
			expect(code).toMatchObject({
				code: 'SPRING20',
				discount_type: 'percentage',
				discount_value: 20,
				applies_to: 'products',
				max_redemptions: 50,
				max_redemptions_per_user: null,
				is_active: true,
				description: 'Spring sale'
			});
			expect(code?.productIds.sort()).toEqual([seeded.bundle.id, seeded.single.id].sort());
			expect(new Date(code?.ends_at ?? '').toISOString()).toBe('2026-12-31T23:59:00.000Z');
			expect(await auditActions(seeded.services, id)).toEqual(['promo.create']);
		});

		it('a fixed discount and minimum spend are typed in pounds and stored in pence', async () => {
			const result = String(
				await post(
					adminId,
					newActions.create,
					'/admin/promotions/new?/create',
					fields({ discountType: 'fixed', discountValue: '5.50', minSubtotal: '20' })
				)
			);
			const code = await seeded.services.commerce.promo.getById(result.split('/').pop() ?? '');
			expect(code).toMatchObject({
				discount_type: 'fixed',
				discount_value: 550,
				min_subtotal: 2000
			});
		});

		it('a products scope without products is a field error', async () => {
			const { status, form } = failed(
				await post(
					adminId,
					newActions.create,
					'/admin/promotions/new?/create',
					fields({ appliesTo: 'products' })
				)
			);
			expect(status).toBe(400);
			expect(fieldErrors(form as FormResult, 'productIds')).toEqual([
				'Select at least one product'
			]);
			expect(await db().select().from(promo_codes)).toEqual([]);
		});

		it('percent 100 is refused on the value field', async () => {
			const { status, form } = failed(
				await post(
					adminId,
					newActions.create,
					'/admin/promotions/new?/create',
					fields({ discountValue: '100' })
				)
			);
			expect(status).toBe(400);
			expect(fieldErrors(form as FormResult, 'discountValue')).toEqual([
				'A percentage must be between 1 and 99'
			]);
			expect(await db().select().from(promo_codes)).toEqual([]);
		});

		it('an end before the start and a duplicate code are field errors', async () => {
			const window = failed(
				await post(
					adminId,
					newActions.create,
					'/admin/promotions/new?/create',
					fields({ startsAt: '2026-11-02T00:00', endsAt: '2026-11-01T00:00' })
				)
			);
			expect(fieldErrors(window.form as FormResult, 'endsAt')).toEqual([
				'The code must end after it starts'
			]);

			await seeded.services.commerce.promo.create(promoInput({ code: 'SPRING20' }));
			const taken = failed(
				await post(adminId, newActions.create, '/admin/promotions/new?/create', fields())
			);
			expect(taken.status).toBe(400);
			expect(fieldErrors(taken.form as FormResult, 'code')).toEqual([
				'A code with that name already exists'
			]);
		});
	});

	it('bulk generates five single-use codes and offers them as CSV', async () => {
		const result = (await post(adminId, bulkActions.generate, '/admin/promotions/bulk?/generate', [
			['prefix', 'gift'],
			['count', '5'],
			['discountType', 'fixed'],
			['discountValue', '10'],
			['appliesTo', 'products'],
			['productIds', seeded.bundle.id],
			['isActive', 'on']
		])) as { generated: { prefix: string; codes: string[]; csv: string } };

		expect(result.generated.prefix).toBe('GIFT');
		expect(result.generated.codes).toHaveLength(5);
		expect(new Set(result.generated.codes).size).toBe(5);
		for (const code of result.generated.codes) expect(code).toMatch(/^GIFT-[A-Z2-9]{6}$/);
		expect(result.generated.csv).toBe(
			['"code"', ...result.generated.codes.map((code) => `"${code}"`), ''].join('\r\n')
		);

		const rows = await db().select().from(promo_codes);
		expect(rows).toHaveLength(5);
		for (const row of rows) {
			expect(row).toMatchObject({
				max_redemptions: 1,
				max_redemptions_per_user: 1,
				discount_type: 'fixed',
				discount_value: 1000,
				applies_to: 'products'
			});
			const summary = await seeded.services.commerce.promo.getById(row.id);
			expect(summary?.productIds).toEqual([seeded.bundle.id]);
		}
	});

	it('bulk refuses more than 500 codes', async () => {
		const { form } = failed(
			await post(adminId, bulkActions.generate, '/admin/promotions/bulk?/generate', [
				['prefix', 'GIFT'],
				['count', '501'],
				['discountType', 'percentage'],
				['discountValue', '10'],
				['appliesTo', 'all']
			])
		);
		expect(fieldErrors(form as FormResult, 'count')).toEqual([
			'Generate at most 500 codes at once'
		]);
		expect(await db().select().from(promo_codes)).toEqual([]);
	});

	it('lists codes with redemptions out of the cap and filters by status', async () => {
		const live = await seeded.services.commerce.promo.create(
			promoInput({ code: 'LIVE', maxRedemptions: 50 })
		);
		await seeded.services.commerce.promo.create(
			promoInput({ code: 'LATER', startsAt: '2099-01-01T00:00:00.000Z' })
		);
		await seeded.services.commerce.promo.create(
			promoInput({ code: 'OVER', endsAt: '2020-01-01T00:00:00.000Z' })
		);
		const used = await seeded.services.commerce.promo.create(
			promoInput({ code: 'USED', maxRedemptions: 1 })
		);
		await redeem(live.id, seeded.users.member.id);
		await redeem(used.id, seeded.users.nobody.id);

		const all = (await runLoad(seeded.services, adminId, listLoad, {
			url: '/admin/promotions'
		})) as ListData;
		expect(all.codes.find((code) => code.code === 'LIVE')).toMatchObject({
			redemptionCount: 1,
			maxRedemptions: 50,
			appliesTo: 'all',
			status: 'active'
		});

		const statusOf = async (status: string) =>
			(
				(await runLoad(seeded.services, adminId, listLoad, {
					url: `/admin/promotions?status=${status}`
				})) as ListData
			).codes.map((code) => code.code);
		expect(await statusOf('active')).toEqual(['LIVE']);
		expect(await statusOf('scheduled')).toEqual(['LATER']);
		expect(await statusOf('expired')).toEqual(['OVER']);
		expect(await statusOf('exhausted')).toEqual(['USED']);
		// An unknown filter shows everything.
		expect((await statusOf('bogus')).sort()).toEqual(['LATER', 'LIVE', 'OVER', 'USED']);
	});

	describe('detail', () => {
		it('shows the redemptions and exports them as quoted CSV', async () => {
			const code = await seeded.services.commerce.promo.create(promoInput({ code: 'CSV10' }));
			const orderId = await redeem(code.id, seeded.users.bundleOwner.id, 450);

			const page = (await runLoad(seeded.services, adminId, editLoad, {
				url: `/admin/promotions/${code.id}`,
				params: { id: code.id }
			})) as EditData;
			expect(page.promo).toMatchObject({ code: 'CSV10', status: 'active', redemptionCount: 1 });
			expect(page.redemptions).toEqual([
				expect.objectContaining({
					orderId,
					userEmail: 'bundle-owner@example.com',
					discountTotal: 450,
					orderStatus: 'paid'
				})
			]);

			const event = await memberEvent(seeded.services, adminId, {
				url: `/admin/promotions/${code.id}/redemptions.csv`,
				params: { id: code.id }
			});
			const response = (await outcome(() =>
				exportCsv(event as unknown as ExportEvent)
			)) as Response;
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
			expect(response.headers.get('content-disposition')).toBe(
				'attachment; filename="csv10-redemptions.csv"'
			);
			const lines = (await response.text()).split('\r\n');
			expect(lines).toEqual([
				'"order_id","buyer_email","discount_pence","redeemed_at","order_status"',
				`"${orderId}","bundle-owner@example.com","450","2026-10-01T10:00:00.000Z","paid"`,
				''
			]);
			// Every cell of every row is quoted.
			for (const line of lines.slice(0, -1)) {
				expect(line.split(',').every((cell) => /^".*"$/.test(cell))).toBe(true);
			}
		});

		it('the CSV export is admin-only', async () => {
			const code = await seeded.services.commerce.promo.create(promoInput());
			const event = await memberEvent(seeded.services, seeded.users.member.id, {
				url: `/admin/promotions/${code.id}/redemptions.csv`,
				params: { id: code.id }
			});
			expect(await outcome(() => exportCsv(event as unknown as ExportEvent))).toBe(
				'redirect 303 /'
			);
		});

		it('update saves the terms, and the code stays once redeemed', async () => {
			const code = await seeded.services.commerce.promo.create(promoInput({ code: 'OLDNAME' }));
			await redeem(code.id, seeded.users.member.id);
			const saved = (await post(
				adminId,
				editActions.update,
				`/admin/promotions/${code.id}?/update`,
				fields({ code: 'NEWNAME', discountValue: '15' }),
				{ id: code.id }
			)) as { form: { message: string } };
			expect(saved.form.message).toBe('Promotion saved.');
			expect(await seeded.services.commerce.promo.getById(code.id)).toMatchObject({
				code: 'OLDNAME',
				discount_value: 15
			});
		});

		it('deactivate keeps the row, and a used code cannot be deleted', async () => {
			const code = await seeded.services.commerce.promo.create(promoInput());
			await redeem(code.id, seeded.users.member.id);

			const result = (await post(
				adminId,
				editActions.deactivate,
				`/admin/promotions/${code.id}?/deactivate`,
				[],
				{ id: code.id }
			)) as { form: { message: string } };
			expect(result.form.message).toBe('Code deactivated.');
			const [row] = await db().select().from(promo_codes).where(eq(promo_codes.id, code.id));
			expect(row).toMatchObject({ id: code.id, is_active: false });
			expect(await db().select().from(promo_redemptions)).toHaveLength(1);
			expect(await auditActions(seeded.services, code.id)).toEqual(['promo.deactivate']);

			const { status, form } = failed(
				await post(
					adminId,
					editActions.delete,
					`/admin/promotions/${code.id}?/delete`,
					[['confirm', 'delete']],
					{ id: code.id }
				)
			);
			expect(status).toBe(400);
			expect(form.errors._errors).toEqual([
				'This code has been used; deactivate it instead of deleting it'
			]);
			expect(await seeded.services.commerce.promo.getById(code.id)).not.toBeNull();
		});

		it('an unused code can be deleted', async () => {
			const code = await seeded.services.commerce.promo.create(promoInput());
			expect(
				await post(
					adminId,
					editActions.delete,
					`/admin/promotions/${code.id}?/delete`,
					[['confirm', 'delete']],
					{ id: code.id }
				)
			).toBe('redirect 303 /admin/promotions');
			expect(await seeded.services.commerce.promo.getById(code.id)).toBeNull();
			expect(await auditActions(seeded.services, code.id)).toEqual(['promo.delete']);
		});

		it('an unknown id is a 404', async () => {
			const id = crypto.randomUUID();
			expect(
				await runLoad(seeded.services, adminId, editLoad, {
					url: `/admin/promotions/${id}`,
					params: { id }
				})
			).toBe('error 404');
		});
	});

	it('non-admins cannot create codes', async () => {
		expect(
			await submitAction(seeded.services, seeded.users.member.id, newActions.create, {
				url: '/admin/promotions/new?/create',
				fields: Object.fromEntries(fields())
			})
		).toBe('error 403');
		expect(await db().select().from(promo_codes)).toEqual([]);
	});
});
