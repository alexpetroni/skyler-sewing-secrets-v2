import * as v from 'valibot';
import { parsePounds } from '../money.ts';
import { slugify } from '../slug.ts';
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

/** Title, slug, copy and cover: the editor's basics section. */
const productBasicsFields = {
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
		v.check((value) => value === '' || /^https:\/\/[^\s]+$/i.test(value), 'Must be an https:// URL')
	)
};

export const productInputSchema = v.pipe(
	v.object({
		/** Fixed at creation: `update` ignores it. */
		kind: v.picklist(productKinds, 'Choose course, bundle or single'),
		...productBasicsFields,
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

/** `update` with some fields left as saved; the kind never changes. */
export type ProductFields = Partial<Omit<ProductInput, 'kind'>>;

/** Rows `GET /admin/api/lessons?q=` returns at most. */
export const LESSON_SEARCH_LIMIT = 20;

/** A pounds amount typed by the admin (`149`, `149.50`) as integer pence. */
const poundsPriceField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.nonEmpty('Enter a price in pounds'),
	v.check((value) => parsePounds(value) !== null, 'Enter pounds and pence, e.g. 149 or 149.50'),
	v.transform((value) => parsePounds(value) ?? 0),
	v.minValue(PRICE_MIN, 'Price must be at least £0.30'),
	v.maxValue(PRICE_MAX, `Price must be at most £${PRICE_MAX / 100}`)
);

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/**
 * A `datetime-local` input read as UTC (the forms say so), so the stored
 * instant does not depend on the server's time zone. Empty → null.
 */
export const utcDateTimeField = v.pipe(
	v.optional(v.nullable(v.string()), null),
	v.transform((value) => (value && value.trim() !== '' ? value.trim() : null)),
	v.transform((value) => (value !== null && LOCAL_DATE_TIME.test(value) ? `${value}Z` : value)),
	v.check((value) => value === null || !Number.isNaN(Date.parse(value)), 'Must be a valid date'),
	v.transform((value) => (value === null ? null : new Date(value).toISOString()))
);

/** An ISO instant as a `datetime-local` value in UTC; '' for none. */
export function toUtcDateTimeLocal(value: string | null): string {
	return value ? new Date(value).toISOString().slice(0, 16) : '';
}

/** `/admin/catalogue/new`: kind, title, a slug (from the title when left empty) and a price. */
export const productCreateSchema = v.pipe(
	v.object({
		kind: v.picklist(['bundle', 'single'] as const, 'Choose bundle or single'),
		title: productBasicsFields.title,
		slug: v.pipe(v.optional(v.string(), ''), v.trim()),
		price: poundsPriceField,
		/** `?lesson=`: the video a new single sells. */
		lessonId: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.check((value) => value === '' || v.is(idSchema, value), 'Invalid lesson')
		)
	}),
	v.transform((input) => ({ ...input, slug: input.slug || slugify(input.title) })),
	v.forward(
		v.check(
			(input) => input.slug.length <= PRODUCT_TITLE_MAX && SLUG_PATTERN.test(input.slug),
			'Slug must be lowercase letters, numbers, and hyphens only'
		),
		['slug']
	),
	v.transform(({ lessonId, ...input }): ProductInput & { lessonId: string } => ({
		...input,
		lessonId,
		tagline: '',
		descriptionMd: '',
		coverImageUrl: '',
		salePrice: null,
		saleStartsAt: null,
		saleEndsAt: null,
		isFeatured: false,
		sortOrder: 0
	}))
);

/** The editor's basics section. */
export const productBasicsSchema = v.object(productBasicsFields);

/** The editor's pricing section: pounds in, pence out. */
export const productPricingSchema = v.pipe(
	v.object({
		price: poundsPriceField,
		salePrice: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.check(
				(value) => value === '' || parsePounds(value) !== null,
				'Enter pounds and pence, e.g. 99 or 99.50'
			),
			v.transform((value) => (value === '' ? null : parsePounds(value))),
			v.check((value) => value === null || value >= PRICE_MIN, 'Sale price must be at least £0.30')
		),
		saleStartsAt: utcDateTimeField,
		saleEndsAt: utcDateTimeField
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

/** The editor's visibility section. */
export const productVisibilitySchema = v.object({
	isPublished: v.optional(v.boolean(), false),
	isFeatured: v.optional(v.boolean(), false),
	sortOrder: v.pipe(
		v.optional(v.number('Must be a whole number'), 0),
		v.integer('Must be a whole number')
	)
});
export type ProductVisibilityInput = v.InferOutput<typeof productVisibilitySchema>;

/** The picker's hidden field: a JSON array of lesson ids, or null when it is not one. */
function parseIdList(text: string): string[] | null {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	return Array.isArray(value) && value.every((id) => v.is(idSchema, id)) ? value : null;
}

const ITEM_RULES: Record<ProductKind, { check: (count: number) => boolean; message: string }> = {
	course: { check: (count) => count === 0, message: 'The course has no item list' },
	bundle: { check: (count) => count >= 2, message: 'A bundle needs at least two videos' },
	single: { check: (count) => count === 1, message: 'A single sells exactly one video' }
};

/** The editor's contents section for a product of `kind`: ordered, deduped lesson ids. */
function productContentsSchema(kind: ProductKind) {
	const rule = ITEM_RULES[kind];
	return v.object({
		lessonIds: v.pipe(
			v.optional(v.string(), '[]'),
			v.transform(parseIdList),
			v.check((ids) => ids !== null, 'Invalid item list'),
			v.transform((ids) => [...new Set(ids ?? [])]),
			v.check((ids) => rule.check(ids.length), rule.message)
		)
	});
}

/** One contents schema per kind; the action picks the one for the product it edits. */
export const productContentsSchemas = {
	course: productContentsSchema('course'),
	bundle: productContentsSchema('bundle'),
	single: productContentsSchema('single')
};
