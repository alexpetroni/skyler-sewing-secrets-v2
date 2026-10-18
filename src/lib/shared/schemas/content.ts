import * as v from 'valibot';

// Rules kept from the legacy admin forms (`legacy/src/routes/admin/{modules,lessons}`).
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const CONTENT_MD_MAX = 50_000;

export const idSchema = v.pipe(v.string(), v.uuid('Invalid id'));

const titleField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.nonEmpty('Title is required'),
	v.maxLength(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`)
);

const slugField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.nonEmpty('Slug is required'),
	v.maxLength(TITLE_MAX, `Slug must be at most ${TITLE_MAX} characters`),
	v.regex(SLUG_PATTERN, 'Slug must be lowercase letters, numbers, and hyphens only')
);

const descriptionField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.maxLength(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`)
);

const orderIndexField = v.pipe(
	v.number('Must be a whole number'),
	v.integer('Must be a whole number'),
	v.minValue(0, 'Must be a whole number of at least 0')
);

/** Empty, or an absolute `https://` URL. */
const httpsUrlField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.check((value) => value === '' || /^https:\/\/[^\s]+$/i.test(value), 'Must be an https:// URL')
);

export const moduleInputSchema = v.object({
	title: titleField,
	slug: slugField,
	description: descriptionField,
	thumbnailUrl: httpsUrlField,
	orderIndex: orderIndexField,
	isPublished: v.optional(v.boolean(), false),
	isBonus: v.optional(v.boolean(), false),
	isCourseContent: v.optional(v.boolean(), true)
});
export type ModuleInput = v.InferOutput<typeof moduleInputSchema>;

export const lessonKinds = ['video', 'article'] as const;
export type LessonKind = (typeof lessonKinds)[number];

export const lessonInputSchema = v.object({
	/** null = standalone video. */
	moduleId: v.nullable(idSchema),
	title: titleField,
	slug: slugField,
	kind: v.picklist(lessonKinds, 'Choose video or article'),
	mediaAssetId: v.nullable(idSchema),
	description: descriptionField,
	contentMd: v.pipe(
		v.optional(v.string(), ''),
		v.maxLength(CONTENT_MD_MAX, `Content must be at most ${CONTENT_MD_MAX} characters`)
	),
	isFreePreview: v.optional(v.boolean(), false),
	isPublished: v.optional(v.boolean(), false),
	orderIndex: orderIndexField
});
export type LessonInput = v.InferOutput<typeof lessonInputSchema>;

export const reorderSchema = v.object({
	ids: v.pipe(v.array(idSchema), v.nonEmpty('Nothing to reorder'))
});

/** Longest playback position accepted, in seconds (24 hours, as legacy). */
export const MAX_POSITION_SECONDS = 86_400;

/** `POST /api/progress`: either field may be sent alone (the heartbeat sends only the position). */
export const progressInputSchema = v.object({
	lessonId: idSchema,
	completed: v.optional(v.boolean()),
	positionSeconds: v.optional(
		v.pipe(
			v.number(),
			v.integer(),
			v.minValue(0),
			v.maxValue(MAX_POSITION_SECONDS, 'Position must be at most a day')
		)
	)
});
export type ProgressBody = v.InferOutput<typeof progressInputSchema>;

/** `GET /api/progress?lessonId=…&moduleId=…`: both optional, both UUIDs when present. */
export const progressQuerySchema = v.object({
	lessonId: v.optional(idSchema),
	moduleId: v.optional(idSchema)
});
