import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { pricing_config, promo_codes, payments, profiles } from '$lib/server/db/schema';
import { isUuid, parseDateField, parseIntField, PROMO_CODE_PATTERN } from '$lib/server/validation';

export const load: PageServerLoad = async () => {
	const [[pricing], promoCodes, recentPayments] = await Promise.all([
		db.select().from(pricing_config).where(eq(pricing_config.is_active, true)).limit(1),
		db.select().from(promo_codes).orderBy(desc(promo_codes.created_at)),
		db.select().from(payments).orderBy(desc(payments.created_at)).limit(20)
	]);

	// Get user emails for payments
	const userIds = recentPayments.map((p) => p.user_id).filter(Boolean);
	let users: Record<string, { email: string }> = {};

	if (userIds.length > 0) {
		const userData = await db
			.select({ id: profiles.id, email: profiles.email })
			.from(profiles)
			.where(inArray(profiles.id, userIds));

		users = Object.fromEntries(userData.map((u) => [u.id, { email: u.email }]));
	}

	const paymentsWithUsers = recentPayments.map((p) => ({
		...p,
		user: p.user_id ? users[p.user_id] : null
	}));

	return {
		pricing: pricing ?? null,
		promoCodes,
		payments: paymentsWithUsers
	};
};

export const actions: Actions = {
	updatePrice: async ({ request }) => {
		const formData = await request.formData();
		// Stripe rejects GBP amounts below 30 pence, so that is the floor
		const basePrice = parseIntField(formData.get('base_price'), { required: true, min: 30, max: 10_000_000 });
		const is_active = formData.get('is_active') === 'on';

		if (!basePrice.ok || basePrice.value === null) {
			return fail(400, { error: `Base price (pence): ${basePrice.ok ? 'This field is required' : basePrice.error}` });
		}
		const base_price = basePrice.value;

		try {
			const [existing] = await db.select({ id: pricing_config.id }).from(pricing_config).limit(1);

			if (existing) {
				await db
					.update(pricing_config)
					.set({ base_price, is_active, updated_at: new Date().toISOString() })
					.where(eq(pricing_config.id, existing.id));
			} else {
				await db.insert(pricing_config).values({ base_price, currency: 'gbp', is_active });
			}
		} catch (error) {
			console.error('Failed to update pricing:', error);
			return fail(500, { error: 'Failed to update pricing' });
		}

		return { success: true, message: 'Pricing updated successfully' };
	},

	createPromo: async ({ request }) => {
		const formData = await request.formData();
		const code = formData.get('code')?.toString().toUpperCase().trim() || '';
		const discount_type: 'percentage' | 'fixed' =
			formData.get('discount_type')?.toString() === 'fixed' ? 'fixed' : 'percentage';
		// 100 % would yield a zero amount, which Stripe rejects; fixed is capped
		// at the largest allowed base price
		const discountValue = parseIntField(formData.get('discount_value'), {
			required: true,
			min: 1,
			max: discount_type === 'percentage' ? 99 : 10_000_000
		});
		const maxUses = parseIntField(formData.get('max_uses'), { min: 1 });
		const validUntil = parseDateField(formData.get('valid_until'));
		const description = formData.get('description')?.toString().trim() || null;

		if (!PROMO_CODE_PATTERN.test(code)) {
			return fail(400, { error: 'Code must be 2–32 letters, numbers, hyphens or underscores' });
		}

		if (!discountValue.ok || discountValue.value === null) {
			return fail(400, { error: `Discount value: ${discountValue.ok ? 'This field is required' : discountValue.error}` });
		}

		if (!maxUses.ok) {
			return fail(400, { error: `Max uses: ${maxUses.error}` });
		}

		if (!validUntil.ok) {
			return fail(400, { error: `Valid until: ${validUntil.error}` });
		}

		if (description && description.length > 500) {
			return fail(400, { error: 'Description must be 500 characters or fewer' });
		}

		const discount_value = discountValue.value;
		const max_uses = maxUses.value;
		const valid_until = validUntil.value;

		// Check for duplicate code
		const [existing] = await db
			.select({ id: promo_codes.id })
			.from(promo_codes)
			.where(eq(promo_codes.code, code))
			.limit(1);

		if (existing) {
			return fail(400, { error: 'This code already exists' });
		}

		try {
			await db.insert(promo_codes).values({
				code,
				discount_type,
				discount_value,
				max_uses,
				valid_from: new Date().toISOString(),
				valid_until,
				description,
				is_active: true
			});
		} catch (error) {
			console.error('Failed to create promo code:', error);
			return fail(500, { error: 'Failed to create promo code' });
		}

		return { success: true, message: 'Promo code created successfully' };
	},

	togglePromo: async ({ request }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString() ?? '';
		const is_active = formData.get('is_active')?.toString() === 'true';

		if (!isUuid(id)) {
			return fail(400, { error: 'Invalid promo code ID' });
		}

		try {
			await db.update(promo_codes).set({ is_active }).where(eq(promo_codes.id, id));
		} catch (error) {
			console.error('Failed to update promo code:', error);
			return fail(500, { error: 'Failed to update promo code' });
		}

		return { success: true };
	}
};
