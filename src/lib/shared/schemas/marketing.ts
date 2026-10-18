import * as v from 'valibot';

// Rules kept from the legacy public forms (`legacy/src/routes/{contact,leave-review}`,
// `legacy/src/routes/api/newsletter`).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hidden field real visitors leave empty; bots fill it in. */
export const HONEYPOT_FIELD = 'website';
/** The field the Cloudflare Turnstile widget posts its token in. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

export const CONTACT_NAME_MAX = 200;
export const CONTACT_SUBJECT_MAX = 200;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 5000;
export const REVIEW_MIN = 20;
export const REVIEW_MAX = 1000;
export const REVIEW_TITLE_MAX = 200;

const emailField = v.pipe(
	v.optional(v.string(), ''),
	v.trim(),
	v.nonEmpty('Email is required'),
	v.regex(EMAIL_PATTERN, 'Please enter a valid email address'),
	v.toLowerCase()
);

export const newsletterSchema = v.object({ email: emailField });
export type NewsletterInput = v.InferOutput<typeof newsletterSchema>;

export const contactSchema = v.object({
	name: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Name is required'),
		v.maxLength(CONTACT_NAME_MAX, `Name must be ${CONTACT_NAME_MAX} characters or fewer`)
	),
	// Kept as typed: the reply goes to this address.
	email: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Email is required'),
		v.regex(EMAIL_PATTERN, 'Please enter a valid email address')
	),
	subject: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.maxLength(CONTACT_SUBJECT_MAX, `Subject must be ${CONTACT_SUBJECT_MAX} characters or fewer`)
	),
	message: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.nonEmpty('Message is required'),
		v.minLength(CONTACT_MESSAGE_MIN, `Message must be at least ${CONTACT_MESSAGE_MIN} characters`),
		v.maxLength(CONTACT_MESSAGE_MAX, `Message must be ${CONTACT_MESSAGE_MAX} characters or fewer`)
	)
});
export type ContactInput = v.InferOutput<typeof contactSchema>;

const RATING_MESSAGE = 'Please select a rating between 1 and 5 stars.';

export const reviewSchema = v.object({
	content: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.minLength(REVIEW_MIN, `Review must be at least ${REVIEW_MIN} characters long.`),
		v.maxLength(REVIEW_MAX, `Review must be less than ${REVIEW_MAX} characters.`)
	),
	rating: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.transform(Number),
		v.integer(RATING_MESSAGE),
		v.minValue(1, RATING_MESSAGE),
		v.maxValue(5, RATING_MESSAGE)
	),
	// Legacy form field name.
	author_title: v.pipe(
		v.optional(v.string(), ''),
		v.trim(),
		v.maxLength(REVIEW_TITLE_MAX, `Title must be ${REVIEW_TITLE_MAX} characters or fewer`)
	)
});
export type ReviewInput = v.InferOutput<typeof reviewSchema>;
