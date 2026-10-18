import * as v from 'valibot';
import { parsePounds } from '../money.ts';
import { optionalDateField, utcDateTimeField } from './catalog.ts';
import { idSchema } from './content.ts';

/** Codes are stored upper-case; `normalizeCode` applies the same rule before lookup. */
export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;
export const PROMO_DESCRIPTION_MAX = 500;
export const PERCENT_MIN = 1;
export const PERCENT_MAX = 99;
export const BULK_PREFIX_PATTERN = /^[A-Z0-9_-]{1,20}$/;
export const BULK_COUNT_MAX = 500;
/** A cart holds at most this many products; `parseCart` truncates beyond it. */
export const CART_MAX_ITEMS = 10;

export const discountTypes = ['percentage', 'fixed'] as const;
export type DiscountType = (typeof discountTypes)[number];
export const promoScopes = ['all', 'products'] as const;
export type PromoScope = (typeof promoScopes)[number];

const CODE_MESSAGE = 'Codes are 2–32 letters, numbers, hyphens or underscores';

/** Buyer input: trimmed and upper-cased before the pattern check. */
export const promoCodeField = v.pipe(
	v.string('Enter a code'),
	v.trim(),
	v.toUpperCase(),
	v.regex(PROMO_CODE_PATTERN, CODE_MESSAGE)
);

export const productIdSchema = idSchema;

/** `?/add` and `?/remove` cart actions. */
export const cartItemSchema = v.object({ productId: productIdSchema });
export type CartItemInput = v.InferOutput<typeof cartItemSchema>;

/** `?/promo` cart action and `?promo=CODE` links. */
export const cartPromoSchema = v.object({ code: promoCodeField });
export type CartPromoInput = v.InferOutput<typeof cartPromoSchema>;

/** Why the cart dropped a product; the cart page explains each one. */
export const cartRemovalReasons = [
	'owned',
	'unpublished',
	'included_in_course',
	'duplicate'
] as const;

/** The signed cookie payload; anything else is treated as an empty cart. */
export const cartStateSchema = v.object({
	items: v.array(productIdSchema),
	promoCode: v.nullable(promoCodeField),
	/** Removals not yet shown to the buyer; the next cart render shows them once. */
	removed: v.optional(
		v.array(v.object({ productId: productIdSchema, reason: v.picklist(cartRemovalReasons) }))
	)
});

const optionalCount = v.optional(
	v.nullable(
		v.pipe(
			v.number('Must be a whole number'),
			v.integer('Must be a whole number'),
			v.minValue(1, 'Must be at least 1')
		)
	),
	null
);

/** The fields a single code and a bulk batch share. */
const promoFields = {
	description: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.maxLength(
			PROMO_DESCRIPTION_MAX,
			`Description must be at most ${PROMO_DESCRIPTION_MAX} characters`
		)
	),
	discountType: v.picklist(discountTypes, 'Choose percentage or fixed'),
	discountValue: v.pipe(
		v.number('Discount must be a whole number'),
		v.integer('Discount must be a whole number'),
		v.minValue(1, 'Discount must be at least 1')
	),
	appliesTo: v.picklist(promoScopes, 'Choose all products or selected products'),
	productIds: v.optional(v.array(productIdSchema), []),
	minSubtotal: optionalCount,
	startsAt: optionalDateField,
	endsAt: optionalDateField,
	isActive: v.optional(v.boolean(), true),
	stackableWithSale: v.optional(v.boolean(), false)
};

export const PERCENT_MESSAGE = `A percentage must be between ${PERCENT_MIN} and ${PERCENT_MAX}`;
export const PRODUCTS_MESSAGE = 'Select at least one product';
export const WINDOW_MESSAGE = 'The code must end after it starts';

/** Admin create / edit form (docs/analysis/05-discounts.md → Admin UI). */
export const promoInputSchema = v.pipe(
	v.object({
		code: v.pipe(
			v.string('Enter a code'),
			v.trim(),
			v.toUpperCase(),
			v.regex(PROMO_CODE_PATTERN, CODE_MESSAGE)
		),
		...promoFields,
		maxRedemptions: optionalCount,
		maxRedemptionsPerUser: optionalCount
	}),
	v.forward(
		v.check(
			(input) =>
				input.discountType !== 'percentage' ||
				(input.discountValue >= PERCENT_MIN && input.discountValue <= PERCENT_MAX),
			PERCENT_MESSAGE
		),
		['discountValue']
	),
	v.forward(
		v.check(
			(input) => input.appliesTo !== 'products' || input.productIds.length > 0,
			PRODUCTS_MESSAGE
		),
		['productIds']
	),
	v.forward(
		v.check(
			(input) => input.startsAt === null || input.endsAt === null || input.startsAt < input.endsAt,
			WINDOW_MESSAGE
		),
		['endsAt']
	)
);
export type PromoInput = v.InferOutput<typeof promoInputSchema>;

/** Admin bulk generation: `count` single-use codes `PREFIX-XXXXXX`. */
export const bulkGenerateSchema = v.pipe(
	v.object({
		prefix: v.pipe(
			v.string('Enter a prefix'),
			v.trim(),
			v.toUpperCase(),
			v.regex(BULK_PREFIX_PATTERN, 'Prefixes are 1–20 letters, numbers, hyphens or underscores')
		),
		count: v.pipe(
			v.number('Count must be a whole number'),
			v.integer('Count must be a whole number'),
			v.minValue(1, 'Generate at least 1 code'),
			v.maxValue(BULK_COUNT_MAX, `Generate at most ${BULK_COUNT_MAX} codes at once`)
		),
		...promoFields
	}),
	v.forward(
		v.check(
			(input) =>
				input.discountType !== 'percentage' ||
				(input.discountValue >= PERCENT_MIN && input.discountValue <= PERCENT_MAX),
			PERCENT_MESSAGE
		),
		['discountValue']
	),
	v.forward(
		v.check(
			(input) => input.appliesTo !== 'products' || input.productIds.length > 0,
			PRODUCTS_MESSAGE
		),
		['productIds']
	),
	v.forward(
		v.check(
			(input) => input.startsAt === null || input.endsAt === null || input.startsAt < input.endsAt,
			WINDOW_MESSAGE
		),
		['endsAt']
	)
);
export type BulkGenerateInput = v.InferOutput<typeof bulkGenerateSchema>;

export const promoProductsSchema = v.object({ productIds: v.array(productIdSchema) });
export const promoActiveSchema = v.object({ active: v.boolean() });

/** Where a code stands now; the admin list filters by it. */
export const promoStatuses = ['active', 'scheduled', 'expired', 'exhausted', 'inactive'] as const;
export type PromoStatus = (typeof promoStatuses)[number];

export const promoListQuerySchema = v.object({
	status: v.pipe(
		v.optional(v.string(), ''),
		v.transform((value) =>
			(promoStatuses as readonly string[]).includes(value) ? (value as PromoStatus) : undefined
		)
	)
});

/** Length of a code from the form's generate button. */
export const GENERATED_CODE_LENGTH = 8;
const GENERATED_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Eight random upper-case letters and digits (Web Crypto, in the browser or on the server). */
export function generatePromoCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_CODE_LENGTH));
	return Array.from(bytes, (byte) => GENERATED_ALPHABET[byte % GENERATED_ALPHABET.length]).join('');
}

const FIXED_MESSAGE = 'Enter pounds and pence, e.g. 5 or 4.99';

/** The typed discount as stored: a whole percentage, or pence for a fixed amount. */
function discountAmount(type: DiscountType, text: string): number | null {
	if (type === 'percentage') return /^\d{1,3}$/.test(text) ? Number(text) : null;
	return parsePounds(text);
}

/** Pounds typed by the admin as pence; empty → null. */
const optionalPoundsField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.check((value) => value === '' || parsePounds(value) !== null, FIXED_MESSAGE),
	v.transform((value) => (value === '' ? null : parsePounds(value)))
);

/** The terms a code form and a bulk form share, as the admin types them. */
const promoFormTerms = {
	description: promoFields.description,
	discountType: promoFields.discountType,
	/** A percentage, or pounds for a fixed discount. */
	discountValue: v.pipe(v.optional(v.string(), ''), v.trim(), v.nonEmpty('Enter the discount')),
	appliesTo: promoFields.appliesTo,
	productIds: promoFields.productIds,
	minSubtotal: optionalPoundsField,
	startsAt: utcDateTimeField,
	endsAt: utcDateTimeField,
	isActive: v.optional(v.boolean(), false),
	stackableWithSale: v.optional(v.boolean(), false)
};

interface FormTerms {
	discountType: DiscountType;
	discountValue: string;
	appliesTo: PromoScope;
	productIds: string[];
	startsAt: string | null;
	endsAt: string | null;
}

/** The checks of `promoInputSchema`, on the typed value and with the same messages. */
const fixedValid = (input: FormTerms) => {
	const amount = discountAmount(input.discountType, input.discountValue);
	return input.discountType !== 'fixed' || (amount !== null && amount >= 1);
};
const percentValid = (input: FormTerms) => {
	if (input.discountType !== 'percentage') return true;
	const amount = discountAmount('percentage', input.discountValue);
	return amount !== null && amount >= PERCENT_MIN && amount <= PERCENT_MAX;
};
const productsChosen = (input: FormTerms) =>
	input.appliesTo !== 'products' || input.productIds.length > 0;
const windowValid = (input: FormTerms) =>
	input.startsAt === null || input.endsAt === null || input.startsAt < input.endsAt;

/** The typed discount as stored, and no products for an all-products code. */
function storedTerms(input: FormTerms): { discountValue: number; productIds: string[] } {
	return {
		discountValue: discountAmount(input.discountType, input.discountValue) ?? 0,
		productIds: input.appliesTo === 'products' ? input.productIds : []
	};
}

/** `/admin/promotions/new` and `/admin/promotions/[id]`: the form's fields to a `PromoInput`. */
export const promoFormSchema = v.pipe(
	v.object({
		code: promoInputSchema.pipe[0].entries.code,
		...promoFormTerms,
		maxRedemptions: optionalCount,
		maxRedemptionsPerUser: optionalCount
	}),
	v.forward(
		v.check((input) => fixedValid(input), FIXED_MESSAGE),
		['discountValue']
	),
	v.forward(
		v.check((input) => percentValid(input), PERCENT_MESSAGE),
		['discountValue']
	),
	v.forward(
		v.check((input) => productsChosen(input), PRODUCTS_MESSAGE),
		['productIds']
	),
	v.forward(
		v.check((input) => windowValid(input), WINDOW_MESSAGE),
		['endsAt']
	),
	v.transform((input): PromoInput => ({ ...input, ...storedTerms(input) }))
);

/** `/admin/promotions/bulk`: the form's fields to a `BulkGenerateInput`. */
export const bulkFormSchema = v.pipe(
	v.object({
		prefix: bulkGenerateSchema.pipe[0].entries.prefix,
		count: bulkGenerateSchema.pipe[0].entries.count,
		...promoFormTerms
	}),
	v.forward(
		v.check((input) => fixedValid(input), FIXED_MESSAGE),
		['discountValue']
	),
	v.forward(
		v.check((input) => percentValid(input), PERCENT_MESSAGE),
		['discountValue']
	),
	v.forward(
		v.check((input) => productsChosen(input), PRODUCTS_MESSAGE),
		['productIds']
	),
	v.forward(
		v.check((input) => windowValid(input), WINDOW_MESSAGE),
		['endsAt']
	),
	v.transform((input): BulkGenerateInput => ({ ...input, ...storedTerms(input) }))
);
