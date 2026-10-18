import * as v from 'valibot';
import {
	CONTENT_MD_MAX,
	httpsUrlField,
	idSchema,
	MAX_POSITION_SECONDS,
	orderIndexField,
	slugField,
	TITLE_MAX,
	titleField
} from './content.ts';

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
	productId: v.pipe(v.optional(v.string(), ''), v.uuid('Choose a product')),
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

/** `/admin/catalogue/new?kind=&lesson=`: a bundle unless `single`; the video a new single sells. */
export const productNewQuerySchema = v.object({
	kind: v.pipe(
		v.optional(v.string(), ''),
		v.transform((value): 'bundle' | 'single' => (value === 'single' ? 'single' : 'bundle'))
	),
	lesson: optionalParam(isUuid)
});

/** `GET /admin/api/lessons?q=`. */
export const lessonSearchQuerySchema = v.object({ q: searchParam });

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

/** The phrase `ConfirmForm` asks for before a module, lesson or video is deleted. */
export const DELETE_PHRASE = 'delete';

export const confirmDeleteSchema = v.object({
	confirm: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.check((value) => value.toLowerCase() === DELETE_PHRASE, 'Type the phrase exactly to confirm')
	)
});

/** The up / down buttons of the module list; the action name carries the direction. */
export const moveModuleSchema = v.object({ id: idSchema });

export const lessonResourceSchema = v.object({
	title: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Title is required'),
		v.maxLength(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`)
	),
	fileUrl: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.regex(/^https:\/\/[^\s]+$/i, 'Must be an https:// URL')
	)
});

export const removeResourceSchema = v.object({ resourceId: idSchema });

export const thumbnailTimeSchema = v.object({
	seconds: v.pipe(
		v.number('Must be a whole number of seconds'),
		v.integer('Must be a whole number of seconds'),
		v.minValue(0, 'Must be a whole number of seconds'),
		v.maxValue(MAX_POSITION_SECONDS, 'Must be within the video')
	)
});

export const importVideoSchema = v.object({
	videoId: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Choose a video'),
		v.maxLength(100)
	)
});

export const lessonListFilters = ['standalone', 'unpublished', 'media-not-ready'] as const;
export type LessonListFilterParam = (typeof lessonListFilters)[number];

export const lessonListQuerySchema = v.object({
	module: optionalParam(isUuid),
	filter: optionalParam((value) =>
		(lessonListFilters as readonly string[]).includes(value)
			? (value as LessonListFilterParam)
			: undefined
	)
});

export const mediaStatuses = ['uploading', 'processing', 'ready', 'failed'] as const;
export type AdminMediaStatus = (typeof mediaStatuses)[number];

export const mediaListQuerySchema = v.object({
	q: searchParam,
	status: optionalParam((value) =>
		(mediaStatuses as readonly string[]).includes(value) ? (value as AdminMediaStatus) : undefined
	)
});

/** Videos per page in the Bunny import browser. */
export const LIBRARY_PAGE_SIZE = 25;

export const libraryQuerySchema = v.object({ q: searchParam, page: pageParam });

/** `POST /admin/api/upload-ticket`: the new video's title and the file's MIME type. */
export const uploadTicketSchema = v.object({
	title: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Title is required'),
		v.maxLength(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`)
	),
	filetype: v.optional(
		v.pipe(v.string(), v.regex(/^video\/[\w.+-]+$/, 'Choose a video file')),
		'video/mp4'
	)
});

/** `POST /admin/api/upload-ticket/reissue`: the asset whose upload is resumed. */
export const reissueTicketSchema = v.object({ assetId: idSchema });

/** `POST /admin/api/markdown-preview`. */
export const markdownPreviewSchema = v.object({
	markdown: v.pipe(
		v.string(),
		v.maxLength(CONTENT_MD_MAX, `Content must be at most ${CONTENT_MD_MAX} characters`)
	)
});

// Marketing content (blog, FAQ, testimonials), inbox and settings; rules kept
// from `legacy/src/routes/admin/{blog,faq,testimonials}`.
export const EXCERPT_MAX = 1000;
export const FAQ_QUESTION_MAX = 500;
export const FAQ_CATEGORY_MAX = 100;
export const TESTIMONIAL_CONTENT_MAX = 2000;

const optionalText = (max: number, label: string) =>
	v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.maxLength(max, `${label} must be at most ${max} characters`)
	);

const requiredText = (max: number, label: string) =>
	v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty(`${label} is required`),
		v.maxLength(max, `${label} must be at most ${max} characters`)
	);

const markdownField = v.pipe(
	v.optional(v.string(), ''),
	v.maxLength(CONTENT_MD_MAX, `Content must be at most ${CONTENT_MD_MAX} characters`)
);

/**
 * A blog post. `contentMd` may be left empty on a legacy post (its stored
 * HTML is kept); the service refuses a new post without it.
 */
export const blogPostSchema = v.object({
	title: titleField,
	slug: slugField,
	excerpt: optionalText(EXCERPT_MAX, 'Excerpt'),
	featuredImageUrl: httpsUrlField,
	contentMd: markdownField
});

export const faqItemSchema = v.object({
	question: requiredText(FAQ_QUESTION_MAX, 'Question'),
	answerMd: v.pipe(
		markdownField,
		v.check((value) => value.trim() !== '', 'Answer is required')
	),
	category: optionalText(FAQ_CATEGORY_MAX, 'Category'),
	orderIndex: orderIndexField,
	isPublished: v.optional(v.boolean(), false)
});

/**
 * A per-row button in a list (FAQ up / down, testimonial publish / feature,
 * contact mark-read): the action name carries what to do.
 */
export const rowActionSchema = v.object({ id: idSchema });

export const testimonialSchema = v.object({
	authorName: requiredText(TITLE_MAX, 'Author name'),
	authorTitle: optionalText(TITLE_MAX, 'Author title'),
	content: requiredText(TESTIMONIAL_CONTENT_MAX, 'Content'),
	rating: v.pipe(
		v.number('Choose a rating from 1 to 5'),
		v.integer('Choose a rating from 1 to 5'),
		v.minValue(1, 'Choose a rating from 1 to 5'),
		v.maxValue(5, 'Choose a rating from 1 to 5')
	),
	country: optionalText(TITLE_MAX, 'Country'),
	orderIndex: orderIndexField,
	isFeatured: v.optional(v.boolean(), false)
});

/** The moderation list's position field. */
export const testimonialOrderSchema = v.object({ id: idSchema, orderIndex: orderIndexField });

export const subscriberStatuses = ['confirmed', 'unconfirmed', 'unsubscribed'] as const;
export type SubscriberStatus = (typeof subscriberStatuses)[number];

export const subscriberListQuerySchema = v.object({
	status: optionalParam((value) =>
		(subscriberStatuses as readonly string[]).includes(value)
			? (value as SubscriberStatus)
			: undefined
	)
});

/** The phrase `ConfirmForm` asks for before maintenance mode is switched on. */
export const MAINTENANCE_PHRASE = 'maintenance on';

export const maintenanceOnSchema = v.object({
	confirm: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.check(
			(value) => value.toLowerCase() === MAINTENANCE_PHRASE,
			'Type the phrase exactly to confirm'
		)
	)
});

/** The homepage preview lesson; empty = the first flagged free-preview lesson. */
export const homePreviewSchema = v.object({
	lessonId: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.check((value) => value === '' || v.is(idSchema, value), 'Choose a lesson')
	)
});
