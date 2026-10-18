import * as v from 'valibot';
import { idSchema, SLUG_PATTERN } from './content.ts';

export const productKinds = ['course', 'bundle', 'single'] as const;
export type ProductKind = (typeof productKinds)[number];

export const PRODUCT_TITLE_MAX = 120;
export const PRODUCT_TAGLINE_MAX = 200;
export const PRODUCT_DESCRIPTION_MAX = 20_000;
/** Stripe refuses GBP amounts under 30p. */
export const PRICE_MIN = 30;
export const PRICE_MAX = 10_000_000;

const priceField = v.pipe(
	v.number('Price must be a whole number of pence'),
	v.integer('Price must be a whole number of pence'),
	v.minValue(PRICE_MIN, `Price must be at least ${PRICE_MIN}p`),
	v.maxValue(PRICE_MAX, `Price must be at most ${PRICE_MAX}p`)
);

/** Empty or missing → null; otherwise a date `Date.parse` accepts, stored as an ISO timestamp. */
export const optionalDateField = v.pipe(
	v.optional(v.nullable(v.string()), null),
	v.transform((value) => (value && value.trim() !== '' ? value.trim() : null)),
	v.check((value) => value === null || !Number.isNaN(Date.parse(value)), 'Must be a valid date'),
	v.transform((value) => (value === null ? null : new Date(value).toISOString()))
);

export const productInputSchema = v.pipe(
	v.object({
		/** Fixed at creation: `update` ignores it. */
		kind: v.picklist(productKinds, 'Choose course, bundle or single'),
		slug: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.nonEmpty('Slug is required'),
			v.maxLength(PRODUCT_TITLE_MAX, `Slug must be at most ${PRODUCT_TITLE_MAX} characters`),
			v.regex(SLUG_PATTERN, 'Slug must be lowercase letters, numbers, and hyphens only')
		),
		title: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.nonEmpty('Title is required'),
			v.maxLength(PRODUCT_TITLE_MAX, `Title must be at most ${PRODUCT_TITLE_MAX} characters`)
		),
		tagline: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.maxLength(PRODUCT_TAGLINE_MAX, `Tagline must be at most ${PRODUCT_TAGLINE_MAX} characters`)
		),
		descriptionMd: v.pipe(
			v.optional(v.string(), ''),
			v.maxLength(
				PRODUCT_DESCRIPTION_MAX,
				`Description must be at most ${PRODUCT_DESCRIPTION_MAX} characters`
			)
		),
		coverImageUrl: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.check(
				(value) => value === '' || /^https:\/\/[^\s]+$/i.test(value),
				'Must be an https:// URL'
			)
		),
		price: priceField,
		salePrice: v.optional(v.nullable(priceField), null),
		saleStartsAt: optionalDateField,
		saleEndsAt: optionalDateField,
		isFeatured: v.optional(v.boolean(), false),
		sortOrder: v.pipe(
			v.optional(v.number('Must be a whole number'), 0),
			v.integer('Must be a whole number')
		)
	}),
	v.forward(
		v.check(
			(input) => input.salePrice === null || input.salePrice < input.price,
			'Sale price must be lower than the price'
		),
		['salePrice']
	),
	v.forward(
		v.check(
			(input) =>
				input.saleStartsAt === null ||
				input.saleEndsAt === null ||
				input.saleStartsAt < input.saleEndsAt,
			'Sale must end after it starts'
		),
		['saleEndsAt']
	)
);
export type ProductInput = v.InferOutput<typeof productInputSchema>;

export const productItemsSchema = v.object({
	lessonIds: v.array(idSchema)
});
export type ProductItemsInput = v.InferOutput<typeof productItemsSchema>;
