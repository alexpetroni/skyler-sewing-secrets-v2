import * as v from 'valibot';
import { idSchema } from './content.ts';

/** One schema per admin form; the action decides with it, the page reuses it for errors. */

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_REASON_MAX = 500;
export const ADMIN_NOTE_MAX = 2000;

const reasonField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.nonEmpty('Give a reason'),
	v.maxLength(ADMIN_REASON_MAX, `Keep the reason under ${ADMIN_REASON_MAX} characters`)
);

/** Actions that carry no input beyond the URL (`unsuspend`, `sendReset`, …). */
export const emptyActionSchema = v.object({});

export const suspendSchema = v.object({ reason: reasonField });

export const grantProductSchema = v.object({
	productId: v.pipe(
		v.optional(v.string(), ''),
		v.nonEmpty('Choose a product'),
		v.uuid('Choose a product')
	),
	reason: reasonField
});

export const revokeProductSchema = v.object({
	productId: idSchema,
	reason: reasonField
});

/** The phrase `ConfirmForm` asks the admin to type before the change is accepted. */
export function setAdminPhrase(isAdmin: boolean): string {
	return isAdmin ? 'make admin' : 'remove admin';
}

export const setAdminSchema = v.pipe(
	v.object({
		isAdmin: v.boolean(),
		confirm: v.pipe(v.optional(v.string(), ''), v.trim())
	}),
	v.forward(
		v.partialCheck(
			[['isAdmin'], ['confirm']],
			(input) => input.confirm.toLowerCase() === setAdminPhrase(input.isAdmin),
			'Type the phrase exactly to confirm'
		),
		['confirm']
	)
);

export const orderNoteSchema = v.object({
	note: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Write a note'),
		v.maxLength(ADMIN_NOTE_MAX, `Keep the note under ${ADMIN_NOTE_MAX} characters`)
	)
});

export const orderStatuses = [
	'pending',
	'paid',
	'expired',
	'refunded',
	'partially_refunded',
	'disputed'
] as const;
export type AdminOrderStatus = (typeof orderStatuses)[number];

const pageParam = v.pipe(
	v.optional(v.string(), '1'),
	v.transform((value) => Number.parseInt(value, 10)),
	v.transform((value) => (Number.isInteger(value) && value > 0 ? value : 1))
);

const searchParam = v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(200));

/** Empty or unknown → undefined: a bad filter in the URL shows everything rather than failing. */
const optionalParam = <T extends string>(parse: (value: string) => T | undefined) =>
	v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.transform((value) => (value === '' ? undefined : parse(value)))
	);

const isUuid = (value: string) => (v.is(idSchema, value) ? value : undefined);

export const userSearchQuerySchema = v.object({ q: searchParam, page: pageParam });

export const orderListQuerySchema = v.object({
	status: optionalParam((value) =>
		(orderStatuses as readonly string[]).includes(value) ? (value as AdminOrderStatus) : undefined
	),
	q: searchParam,
	page: pageParam
});

export const auditQuerySchema = v.object({
	entity: optionalParam((value) => (/^[a-z_]{1,40}$/.test(value) ? value : undefined)),
	entityId: optionalParam((value) => (value.length <= 100 ? value : undefined)),
	actorId: optionalParam(isUuid),
	page: pageParam
});

/** Reads a query schema from `url.searchParams`; the schemas above never fail. */
export function parseQuery<S extends v.GenericSchema>(
	schema: S,
	params: URLSearchParams
): v.InferOutput<S> {
	return v.parse(schema, Object.fromEntries(params));
}
